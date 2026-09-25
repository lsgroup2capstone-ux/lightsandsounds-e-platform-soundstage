const fs = require('node:fs')
const path = require('node:path')
const Module = require('node:module')
const ts = require('typescript')
module.exports = function createLoader(overrides = {}) {
  const cache = new Map()
  function load(filename) {
    filename = path.resolve(filename)
    if (overrides[filename]) return overrides[filename]
    if (cache.has(filename)) return cache.get(filename).exports
    const file = new Module(filename, module)
    file.filename = filename
    file.paths = Module._nodeModulePaths(path.dirname(filename))
    cache.set(filename, file)
    const nativeRequire = file.require.bind(file)
    file.require = name => {
      if (overrides[name]) return overrides[name]
      if (name === 'server-only') return {}
      const local = name.startsWith('@/') ? path.resolve(name.slice(2)) : name.startsWith('.') ? path.resolve(path.dirname(filename), name) : null
      if (local && fs.existsSync(local + '.ts')) return load(local + '.ts')
      return nativeRequire(name)
    }
    file._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, filename)
    return file.exports
  }
  return load
}
