const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const Module = require('module');

function cleanupTempDirs(mod) {
  try {
    const dir = path.join(__dirname, 'node_modules');
    for (const entry of fs.readdirSync(dir)) {
      if (entry.startsWith(`.${mod}`)) {
        fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
      }
    }
  } catch (_) {}
}

function persistDependency(mod) {
  try {
    const pkgPath = path.join(__dirname, 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    pkg.dependencies = pkg.dependencies || {};
    if (!pkg.dependencies[mod]) {
      pkg.dependencies[mod] = '*';
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
    }
  } catch (e) {
    console.error('Não foi possível salvar dependência no package.json:', e.message);
  }
}

function installMissing(mod) {
  const run = extra => {
    execSync(`npm install ${mod} --no-save --no-package-lock ${extra || ''}`.trim(), { stdio: 'inherit' });
  };
  try {
    console.log(`Instalando dependência ausente: ${mod}`);
    run();
    cleanupTempDirs(mod);
    require.resolve(mod);
    persistDependency(mod);
  } catch (err) {
    console.warn(`Primeira tentativa falhou para ${mod}: ${err.message}`);
    cleanupTempDirs(mod);
    try {
      run('--force');
      cleanupTempDirs(mod);
      require.resolve(mod);
      persistDependency(mod);
    } catch (err2) {
      console.error(`Falha ao instalar ${mod}:`, err2.message);
    }
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
      missing.forEach(installMissing);
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
