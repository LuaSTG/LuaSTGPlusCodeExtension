# LuaSTGPlus

This extension makes it possible to run LuaSTG games in VSCode, which aims to make the VSCode a development environment for LuaSTG.

To run the LuaSTG game, you have to put all the assets into the `dist` directory under the current working space. This extension will then copy all the files into memory and watch file changes to keep all the files the same in the local filesystem.

Issue command `Launch` to start a LuaSTG game.

- Visit our website to read more about LuaSTG: http://luastg.com

## Features

- Directly running your game in VSCode
- File changes are automatically synced

## Requirements

Since this extension runs in WebView, game assets are all loaded into memory, and a 64-bit VSCode with lots of memory is expected to run this extension.

## Extension Settings

Currently, we do not support any extension settings.

## Known Issues

- If you are losing input focus, please click the editor's page tab to retain focus

## Release Notes

- Initial release
