const { execSync } = require('child_process');
const path = require('path');
const Module = require('module');

function installMissing(mod) {
  try {
    console.log(`Instalando dependência ausente: ${mod}`);
    execSync(`npm install ${mod}`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`Falha ao instalar ${mod}:`, err.message);
  }
}

// Garante instalação de dependências declaradas no package.json
(function ensurePackageDeps() {
  try {
    const pkg = require('./package.json');
    const deps = Object.keys(pkg.dependencies || {});
    const missing = deps.filter(d => {
      try {
        require.resolve(d);
        return false;
      } catch {
        return true;
      }
    });
    if (missing.length) {
      console.log('Instalando dependências faltantes:', missing.join(', '));
      execSync(`npm install ${missing.join(' ')}`, { stdio: 'inherit' });
    }
  } catch (err) {
    console.error('Erro ao verificar dependências do package.json:', err.message);
  }
})();

// Intercepta require para instalar módulos não listados
const originalRequire = Module.prototype.require;
Module.prototype.require = function(moduleName) {
  try {
    return originalRequire.apply(this, arguments);
  } catch (err) {
    if (err.code === 'MODULE_NOT_FOUND' && !moduleName.startsWith('.') && !path.isAbsolute(moduleName)) {
      installMissing(moduleName);
      return originalRequire.apply(this, arguments);
    }
    throw err;
  }
};

require('./app');
