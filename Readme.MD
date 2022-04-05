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

A typical usage is in VIM you can run :

```
:!NO_COLOR=true cs2json.ts %:t %:p:h/roslysis.json
```

this will fill up the file(given by `%:t`) with empty json or enums.
