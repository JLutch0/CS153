#!/usr/bin/env node
// Launches electron-vite dev with ELECTRON_RUN_AS_NODE removed.
// This env var is set by parent Electron processes (e.g. VSCode/Claude Code)
// and causes Electron to run in Node-compat mode, breaking app APIs.
const { spawn } = require('child_process')
const path = require('path')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const bin = path.join(__dirname, '../node_modules/.bin/electron-vite')
const cmd = process.platform === 'win32' ? bin + '.cmd' : bin

const proc = spawn(cmd, ['dev'], { stdio: 'inherit', env, shell: true })
proc.on('close', code => process.exit(code || 0))
