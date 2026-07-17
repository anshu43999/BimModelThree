import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const workspaceDir = path.resolve(rootDir, '..')
const convertedDir = path.resolve(workspaceDir, 'converter-service', 'output')
const port = Number(process.env.PORT || 5176)
const host = process.env.HOST || '127.0.0.1'

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',
  '.frag': 'application/octet-stream',
  '.ifc': 'application/octet-stream',
}

function send(response, statusCode, body, headers = {}) {
  response.writeHead(statusCode, headers)
  response.end(body)
}

const server = http.createServer((request, response) => {
  const url = new URL(
    request.url,
    `http://${request.headers.host || 'localhost'}`,
  )
  const pathname = decodeURIComponent(url.pathname)
  const isConvertedAsset = pathname === '/converted' || pathname.startsWith('/converted/')
  const relativePath = pathname === '/' ? 'viewer/index.html' : pathname.slice(1)
  const filePath = isConvertedAsset
    ? path.resolve(convertedDir, pathname.replace(/^\/converted\/?/, ''))
    : path.resolve(rootDir, relativePath)
  const allowedRoot = isConvertedAsset ? convertedDir : rootDir

  if (!filePath.startsWith(allowedRoot + path.sep) && filePath !== allowedRoot) {
    send(response, 403, 'Forbidden')
    return
  }

  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      send(response, 404, 'Not found')
      return
    }

    const ext = path.extname(filePath).toLowerCase()
    response.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    })
    fs.createReadStream(filePath).pipe(response)
  })
})

function getLanIPv4Addresses() {
  const interfaces = os.networkInterfaces()
  const addresses = []
  for (const items of Object.values(interfaces)) {
    for (const item of items || []) {
      if (item.family === 'IPv4' && !item.internal) {
        addresses.push(item.address)
      }
    }
  }
  return addresses
}

server.listen(port, host, () => {
  console.log(`Fragments viewer PC: http://127.0.0.1:${port}/viewer/index.html`)
  console.log(
    `Fragments viewer demo: http://127.0.0.1:${port}/viewer/demo.html`,
  )
  console.log(
    `Fragments viewer mobile: http://127.0.0.1:${port}/viewer/mobile.html`,
  )

  if (host === '0.0.0.0') {
    const addresses = getLanIPv4Addresses()
    if (!addresses.length) {
      console.log('LAN address not found. Check your Wi-Fi or network adapter.')
      return
    }
    console.log('LAN mobile URLs:')
    for (const address of addresses) {
      console.log(`  http://${address}:${port}/viewer/mobile.html`)
    }
  }
})
