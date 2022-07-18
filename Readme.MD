# deno-scripts

A collection of scripts used for the following purpose:

- coding automation

# Scripts

## cs2json

Converts csharp class to typescript module

### Pre-requisites

- [GetAst](https://github.com/kahgeh/GetAst) : ensure it's accessible (part of path `PATH`)

### Usage

```
  cs2json <file name> <settings file>

  where
    file name is the file name of typescript module, the file name needs must be a type name in the provided source file. For enumerations, use "enums.ts" for the file name
    settings file is where the source files are specified, it must be called roslysis.json and must be parsable to the Rolysis type.

```

A typical usage is in VIM you can run(will need to update path in .vimrc(e.g. `export PATH=$HOME/deno-scripts:$PATH`) for deno scripts to run as external command) :

```
:!NO_COLOR=true cs2json.ts %:t %:p:h/roslysis.json
```

this will fill up the file(given by `%:t`) with empty json or enums.

## tok

Converts docker run commmand into skaffold config and k8s manifest.

### Pre-requisites

- config.ts in the same folder as tok.ts. It should contain and exported variable `LOCAL_ENV_PATH` pointing to the base folder where the service folder will created

### Usage

Provide execute privilege to current user.

`chmod +x tok.ts`

Copy the docker command into the clipboard. Then run the command by just typing `tok.ts` in the terminal.

```
> tok.ts
generated skaffold config and k8s manifest, you can run it using the command below
cd /Users/kahgeh.tan/Dev/local-env/jaeger
skaffold run --port-forward --tail
```
