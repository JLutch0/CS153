#!/usr/bin/env node
// Second dev instance: Vite renderer on port 5174, isolated electron-store data dir.
const { spawn } = require('child_process')
const path = require('path')
const os = require('os')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.LENS_USER_DATA = path.join(os.tmpdir(), 'lens-dev-2')
env.VITE_PORT = '5174'

const bin = path.join(__dirname, '../node_modules/.bin/electron-vite')
const cmd = process.platform === 'win32' ? bin + '.cmd' : bin

const proc = spawn(cmd, ['dev'], { stdio: 'inherit', env, shell: true })
proc.on('close', code => process.exit(code || 0))
