import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { assembleRpbRaid, fetchRpbImportStep, importRpbRaid } from './RPB/server/rpbImportService.js'
import { fetchWowheadItemMetaBatch } from './RPB/server/wowheadItemMeta.js'
import rpbStoreHandler from './api/rpb-store.js'
import profileStoreHandler from './api/profile-store.js'

function attachVercelStyleHelpers(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (payload) => {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
    return res
  }
  return res
}

async function readJsonBody(req) {
  const body = await new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => resolve(raw))
    req.on('error', reject)
  })
  return body ? JSON.parse(body) : {}
}

function rpbDevApiPlugin() {
  return {
    name: 'rpb-dev-api',
    configureServer(server) {
      server.middlewares.use('/api/rpb-item-meta', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (req.method !== 'GET') {
          next()
          return
        }

        try {
          const url = new URL(req.url, 'http://localhost')
          const ids = String(url.searchParams.get('ids') || '')
            .split(',')
            .map(value => value.trim())
            .filter(Boolean)

          const result = await fetchWowheadItemMetaBatch(ids)
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ items: result }))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'Item metadata lookup failed' }))
        }
      })

      server.middlewares.use('/api/rpb-import', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (req.method !== 'POST') {
          next()
          return
        }

        try {
          const body = await new Promise((resolve, reject) => {
            let raw = ''
            req.on('data', chunk => { raw += chunk })
            req.on('end', () => resolve(raw))
            req.on('error', reject)
          })

          const payload = body ? JSON.parse(body) : {}
          let result

          if (payload.action === 'step') {
            result = await fetchRpbImportStep(payload.step, payload)
          } else if (payload.action === 'assemble') {
            result = assembleRpbRaid(payload, payload.datasets || {})
          } else {
            result = await importRpbRaid(payload)
          }

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(result))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'Import failed' }))
        }
      })

      server.middlewares.use('/api/rpb-store', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (!['GET', 'POST'].includes(req.method)) {
          next()
          return
        }

        try {
          const url = new URL(req.url, 'http://localhost')
          req.query = Object.fromEntries(url.searchParams.entries())
          req.body = req.method === 'POST' ? await readJsonBody(req) : {}
          await rpbStoreHandler(req, attachVercelStyleHelpers(res))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'RPB store failed' }))
        }
      })

      server.middlewares.use('/api/profile-store', async (req, res, next) => {
        if (req.method === 'OPTIONS') {
          res.statusCode = 200
          res.end()
          return
        }

        if (!['GET', 'POST'].includes(req.method)) {
          next()
          return
        }

        try {
          const url = new URL(req.url, 'http://localhost')
          req.query = Object.fromEntries(url.searchParams.entries())
          req.body = req.method === 'POST' ? await readJsonBody(req) : {}
          await profileStoreHandler(req, attachVercelStyleHelpers(res))
        } catch (error) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: error.message || 'Profile store failed' }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), rpbDevApiPlugin()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase': ['firebase/app', 'firebase/firestore'],
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        }
      }
    }
  }
})
