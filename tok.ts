#!/usr/bin/env -S deno run --allow-run --allow-write --allow-read --quiet

import { stringify as yamlStringify } from 'https://deno.land/std/encoding/yaml.ts';
import { parse } from 'https://deno.land/std/flags/mod.ts';
import { nanoid } from 'https://deno.land/x/nanoid/mod.ts';
import { ensureDirSync } from 'https://deno.land/std/fs/mod.ts';
import { LOCAL_ENV_PATH } from './config.ts';
// ----------------------------------------------------------------------------
// this section of code is based on the reference below, some fixes
// have been applied
// Copyright (c) 2019 Rafał Pocztarski. All rights reserved.
// MIT License (Expat). See: https://github.com/rsp/deno-clipboard
type OperatingSystem = 'darwin' | 'win' | 'linux';
type Dispatch = {
  [key in OperatingSystem]: Clipboard;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const encode = (x: string) => encoder.encode(x);
export const decode = (x: Uint8Array) => decoder.decode(x);
const opt: Deno.RunOptions = {
  args: [],
  stdin: 'piped',
  stdout: 'piped',
  stderr: 'piped',
};

async function read(args: string[]): Promise<string> {
  const p = Deno.run({ ...opt, cmd: args });
  return decode(await p.output());
}

async function write(args: string[], data: string): Promise<void> {
  const p = Deno.run({ ...opt, args });
  await p.stdin.write(encode(data));
  p.stdin.close();
  await p.status();
}

const linux: Clipboard = {
  os: 'linux',
  async readText() {
    // return read(['xclip', '-selection', 'clipboard', '-o']);
    return read(['xsel', '-b', '-o']);
  },
  async writeText(data) {
    // return write(['xclip', '-selection', 'clipboard'], data);
    return write(['xsel', '-b', '-i'], data);
  },
};

const darwin: Clipboard = {
  os: 'darwin',
  async readText() {
    return read(['pbpaste']);
  },
  async writeText(data) {
    return write(['pbcopy'], data);
  },
};

const win: Clipboard = {
  os: 'win',
  async readText() {
    const data = await read([
      'powershell',
      '-noprofile',
      '-command',
      'Get-Clipboard',
    ]);
    return data.replace(/\r/g, '').replace(/\n$/, '');
  },
  async writeText(data) {
    return write(
      ['powershell', '-noprofile', '-command', '$input|Set-Clipboard'],
      data
    );
  },
};

const dispatch: Dispatch = {
  linux,
  darwin,
  win,
};

class Clipboard {
  os: OperatingSystem;
  constructor(os: OperatingSystem) {
    if (!dispatch[os]) {
      throw new Error(`Clipboard: unsupported OS: ${os}`);
    }
    this.os = os;
  }
  async readText(): Promise<string> {
    return dispatch[this.os].readText();
  }
  async writeText(data: string): Promise<void> {
    return dispatch[this.os].writeText(data);
  }
}
// ----------------------------------------------------------------------------
type Protocol = string | 'TCP' | 'UDP';
interface PortMap {
  containerPort: number;
  hostPort: number;
  protocol: Protocol;
}

interface KeyValuePair<T1, T2> {
  key: T1;
  value: T2;
}
interface DockerCommand {
  containerName: string;
  daemon: boolean;
  ports: PortMap[];
  envVars: KeyValuePair<string, string>[];
  image: string;
}

class ValidationError extends Error {
  constructor(
    message: string,
    private fnName: string,
    private parameterName: string,
    private validationName: string
  ) {
    super(message);
    this.name = 'MapperValidationError';
  }
}

function toPortMap(portMapText: string, defaultProtocol = 'TCP'): PortMap {
  if (portMapText.length < 1) {
    throw new ValidationError(
      'Cannot map empty text to port map',
      'toPortMap',
      'portMapText',
      'text_isnot_empty'
    );
  }

  // map/protocol, where map like 5775:5775 and protocol is either TCP or UDP
  const mapProtocolParts = portMapText.split('/');
  let protocol = defaultProtocol;
  if (mapProtocolParts.length > 1) {
    protocol = mapProtocolParts[1].toUpperCase();
  }
  const sourceToTargetText = mapProtocolParts[0];
  const sourceToTargetParts = sourceToTargetText.split(':');
  // todo: validate instead of causing error
  const containerPort = parseInt(sourceToTargetParts[0]);
  const hostPort = parseInt(sourceToTargetParts[1]);

  return {
    containerPort,
    hostPort,
    protocol,
  };
}

function toEnvVar(envVarText: string): KeyValuePair<string, string> {
  if (envVarText.length < 1) {
    throw new ValidationError(
      'Cannot map empty text to environment variable',
      'toEnvVar',
      'envVarText',
      'text_isnot_empty'
    );
  }
  const pair = envVarText.split('=');
  return {
    key: pair[0],
    value: pair[1],
  };
}

enum DockerArg {
  p = 'p',
  port = 'port',
  e = 'e',
  env = 'env',
  name = 'name',
  d = 'd',
  _ = '_',
}

function parseDockerCmdText(cmdText: string): DockerCommand {
  const cmdParts = parse(cmdText.split(' '), {
    collect: [DockerArg.p, DockerArg.port, DockerArg.e, DockerArg.env],
  });
  console.log(cmdParts);
  const portMapTexts: string[] = [
    ...new Set([
      ...(cmdParts[DockerArg.p] ? (cmdParts[DockerArg.p] as string[]) : []),
      ...(cmdParts[DockerArg.port]
        ? (cmdParts[DockerArg.port] as string[])
        : []),
    ]),
  ];
  const ports = portMapTexts.map((t) => toPortMap(t as string));

  const envVarTexts: string[] = [
    ...new Set([
      ...(cmdParts[DockerArg.e] ? (cmdParts[DockerArg.e] as string[]) : []),
      ...(cmdParts[DockerArg.env] ? (cmdParts[DockerArg.env] as string[]) : []),
    ]),
  ];
  const envVars = envVarTexts.map((t) => toEnvVar(t as string));
  const containerName = cmdParts[DockerArg.name] as string;
  const daemon = cmdParts[DockerArg.d] as boolean;
  const image = ([...cmdParts[DockerArg._]].pop() as string).replace('\n', '');
  return {
    containerName,
    daemon,
    envVars,
    ports,
    image,
  };
}
//-----------------------------------------------------------------------------
// k8s types

interface Metadata {
  name: string;
  labels: Record<string, string>;
}

interface ServicePort {
  name: string;
  port: number;
  targetPort: string;
  protocol: Protocol;
}

interface Service {
  apiVersion: 'v1';
  kind: 'Service';
  metadata: Metadata;
  spec: {
    clusterIP: 'None' | 'LoadBalancer' | 'Node';
    selector: Record<string, string>;
    ports: ServicePort[];
  };
}

interface ContainerPort {
  name: string;
  containerPort: number;
}

interface ContainerSpec {
  name: string;
  image: string;
  ports: ContainerPort[];
  env: { name: string; value: string }[];
}

interface Template {
  metadata: {
    labels: Record<string, string>;
  };
  spec: { containers: ContainerSpec[] };
}

interface Deployment {
  apiVersion: 'apps/v1';
  kind: 'Deployment';
  metadata: Metadata;
  spec: {
    replicas: number;
    selector: {
      matchLabels: Record<string, string>;
    };
    template: Template;
  };
}
//-----------------------------------------------------------------------------
function generateK8sManifest(dockerCmd: DockerCommand) {
  const { containerName: name } = dockerCmd;
  let service: Service = {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: { name, labels: { app: name } },
    spec: {
      clusterIP: 'None',
      selector: { app: name },
      ports: [],
    },
  };
  const { ports, envVars, image } = dockerCmd;
  service.spec.ports = ports.map((p, i) => {
    return {
      name: `p-${i}`,
      port: p.hostPort,
      protocol: p.protocol,
      targetPort: `p-${i}`,
    };
  });

  const deployment: Deployment = {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name,
      labels: { app: name },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: name,
          },
        },
        spec: {
          containers: [
            {
              name,
              image,
              ports: [],
              env: [],
            },
          ],
        },
      },
    },
  };
  deployment.spec.template.spec.containers[0].ports = ports.map((p, i) => {
    return {
      name: `p-${i}`,
      containerPort: p.containerPort,
    };
  });
  deployment.spec.template.spec.containers[0].env = envVars.map((e) => {
    return {
      name: e.key,
      value: e.value,
    };
  });

  return `${yamlStringify(service as unknown as Record<string, object>)}---
${yamlStringify(deployment as unknown as Record<string, object>)} `;
}

interface SkfDeployK8s {
  manifests: string[];
}

interface Skaffold {
  apiVersion: 'skaffold/v2beta29';
  kind: 'Config';
  metadata: {
    name: string;
  };
  deploy: {
    kubectl: { manifests: string[] };
  };
}

function generateSkaffold(name: string, k8sManifestPath: string) {
  const skaffold: Skaffold = {
    apiVersion: 'skaffold/v2beta29',
    kind: 'Config',
    metadata: {
      name,
    },
    deploy: {
      kubectl: {
        manifests: [k8sManifestPath],
      },
    },
  };

  return yamlStringify(skaffold as unknown as Record<string, object>);
}

export const clipboard = new Clipboard(Deno.build.os as OperatingSystem);

const copiedCmd = await clipboard.readText();
const dockerCmd = parseDockerCmdText(copiedCmd);
const serviceName = dockerCmd.containerName
  ? (dockerCmd.containerName as string)
  : nanoid();

const serviceFolderPath = `${LOCAL_ENV_PATH}/${serviceName}`;
const serviceConfigPath = `${serviceFolderPath}/service.yml`;
ensureDirSync(serviceFolderPath);

const k8sManifest = generateK8sManifest(dockerCmd);
Deno.writeTextFileSync(serviceConfigPath, k8sManifest);
const skaffoldConfigPath = `${serviceFolderPath}/skaffold.yml`;

const skaffoldManifest = generateSkaffold(serviceName, serviceConfigPath);
Deno.writeTextFileSync(skaffoldConfigPath, skaffoldManifest);
console.log(
  'generated skaffold config and k8s manifest, you can run it using the command below'
);
console.log(`cd ${serviceFolderPath}`);
console.log(`skaffold run --port-forward --tail`);
