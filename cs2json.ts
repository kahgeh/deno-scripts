#!/usr/bin/env -S deno run --allow-run --allow-read --quiet
// ----------------------------------------------------------------------------
// types
namespace Ast {
  export enum KnownTypes {
    string = 'string',
    dateTime = 'DateTime',
    guid = 'Guid',
  }
  export interface Property {
    name: string;
    type: string;
    isCollection: boolean;
  }

  export interface KeyValuePair {
    key: string;
    value: string;
  }

  export interface Type {
    name: string;
    properties: Property[];
    stringFields: KeyValuePair[];
  }
}

interface Roslysis {
  sourceFiles: string[];
}

// ----------------------------------------------------------------------------
const args = Deno.args;

if (args.length < 1) {
  console.error('expected file name was not provided');
  Deno.exit(-1);
}

if (args.length < 2) {
  console.error('expected roslysis.json does not exist');
  Deno.exit(-1);
}

const tab = '  ';
function getTypeModuleContents(
  type: Ast.Type,
  depth: undefined | number = undefined
) {
  let complexTypes = [];
  let json = [];
  const tabs = depth ? tab.repeat(depth) : tab;
  json.push(`{`);
  for (const property of type.properties) {
    let val = `${property.type[0].toLowerCase()}${property.type.slice(1)}`;
    let skipName = false;
    if (property.isCollection) {
      val = '[]';
    } else {
      switch (property.type) {
        case Ast.KnownTypes.dateTime:
          val = `'${new Date().toJSON()}'`;
          break;
        case Ast.KnownTypes.string:
          val = "''";
          break;
        case Ast.KnownTypes.guid:
          val = `"${crypto.randomUUID()}"`;
          break;
        default:
          complexTypes.push(val);
          skipName = true;
      }
    }
    json.push(
      skipName
        ? `${tabs}${val},`
        : `${tabs}${property.name[0].toLowerCase()}${property.name.slice(
            1
          )}: ${val},`
    );
  }
  // remove last comma
  json[json.length - 1] = json[json.length - 1].replace(/,\s*$/, '');
  json.push(`}`);
  return { json, complexTypes };
}

function getEnumsModuleContent(stringEnums: Ast.Type[]) {
  let json: string[] = [];
  for (const stringEnum of stringEnums) {
    const { name, stringFields } = stringEnum;
    json.push(`export enum ${name} {`);
    for (const enumVal of stringFields) {
      const { key, value } = enumVal;
      json.push(`${tab}${key}="${value}",`);
    }
    json[json.length - 1] = json[json.length - 1].replace(/,\s*$/, '');
    json.push('}\n');
  }
  return json;
}
const roslysisJsonRaw = await Deno.readFile(args[1]);
const roslysisJsonText = new TextDecoder('utf-8').decode(roslysisJsonRaw);
const roslysis: Roslysis = JSON.parse(roslysisJsonText);
const getAstProcess = Deno.run({
  stdout: 'piped',
  stderr: 'piped',
  env: {
    NO_COLOR: 'true',
  },
  cmd: ['csharp-ast', roslysis.sourceFiles[0]],
});

const astRaw = await getAstProcess.output();
const astJsonText = new TextDecoder().decode(astRaw);
const types: Ast.Type[] = JSON.parse(astJsonText);
const typeName = args[0].replace('.ts', '');

if (typeName == 'enums') {
  const enums = types.filter(
    (t) => t.properties.length == 0 && t.stringFields.length > 0
  );
  const json = getEnumsModuleContent(enums);
  console.log(json.join('\n'));
  Deno.exit(0);
}

const csTypeName = `${typeName[0].toUpperCase()}${typeName.slice(1)}`;
const type = types.find((t) => t.name == csTypeName);
if (type === undefined) {
  console.error(`cannot find ${csTypeName}`);
  Deno.exit(-1);
}

const { json, complexTypes } = getTypeModuleContents(type);

for (const complexType of complexTypes) {
  console.log(`import ${complexType} from './${complexType}.ts'`);
}
console.log('');
console.log(`export default ${json.join('\n')};`);
