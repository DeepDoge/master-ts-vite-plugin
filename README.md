# MasterTS Vite Plugin

The MasterTS Vite Plugin is a powerful addition to [MasterTS](https://github.com/DeepDoge/master-ts) that optimizes the runtime performance of your code by leveraging caching and build-time optimizations.

## What does it do?

This plugin enhances your MasterTS code execution speed by utilizing caching mechanisms and performing build-time optimizations.

## Usage

To use the MasterTS Vite Plugin, follow these steps:

1. In the root of your Vite project, locate the `vite.config.ts` file. If it doesn't exist, create it.

2. Inside the `vite.config.ts` file, import the following dependencies:
   - `masterTs` from `"master-ts-vite-plugin/plugin"`
   - `parse` from `"master-ts/library/template/parse"`
   - `typescript` from `"typescript"`

   *Please note that the `master-ts` and `master-ts-vite-plugin` modules have TypeScript (TS) files only. However, while `vite.config.ts` is a TS file, it doesn't allow importing TS files from modules directly. As a [workaround](https://github.com/vitejs/vite/issues/5370#issuecomment-1339022262), you can import these dependencies from `node_modules` using the relative path.*

3. Within the `plugins` section of the configuration, add `masterTs({ typescript, parse })` as a plugin.

   Here's an example configuration snippet:
   ```ts
   // vite.config.ts
   import { masterTs } from "./node_modules/master-ts-vite-plugin/plugin"
   import { parse } from "./node_modules/master-ts/library/template/parse"
   import typescript from "typescript"
   import { defineConfig } from "vite"

   export default defineConfig({
     plugins: [masterTs({ parse, typescript })],
     // ...
   })
   ```

## Install

For installation instructions, please refer to the [MasterTS Vite Plugin Releases](https://github.com/DeepDoge/master-ts-vite-plugin/releases) page.

## Guidelines

- The MasterTS library itself does not require this plugin for any of its features.
- Your code should function perfectly fine without this plugin.
- The sole purpose of the MasterTS Vite Plugin is to optimize the runtime performance of your code and make it faster.
