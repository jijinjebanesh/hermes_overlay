const fs = require('fs');
const path = require('path');

['main', 'preload'].forEach(dir => {
  const dirPath = path.join(__dirname, '..', 'dist-electron', dir);
  if (fs.existsSync(dirPath)) {
    fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.js') || f.endsWith('.cjs'))
      .forEach(f => {
        const old = path.join(dirPath, f);
        const newf = path.join(dirPath, f.replace('.js', '.cjs'));
        
        let code = fs.readFileSync(old, 'utf8');
        // Replace require('./something') with require('./something.cjs')
        code = code.replace(/require\(['"](\..*?)(?:\.cjs)?['"]\)/g, "require('$1.cjs')");
        fs.writeFileSync(old, code);
        
        if (old !== newf) {
          fs.renameSync(old, newf);
        }
        console.log('Processed ' + dir + '/' + f);
      });
  }
});
