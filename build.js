const { execSync } = require('child_process');

console.log('📦 Starting build process...');

try {
  console.log('⚡ Minifying styles.css...');
  execSync('npx -y clean-css-cli -o styles.min.css styles.css');
  console.log('✓ styles.min.css updated successfully.');

  console.log('⚡ Minifying app.js...');
  execSync('npx -y terser app.js -o app.min.js --compress --mangle');
  console.log('✓ app.min.js updated successfully.');

  console.log('🎉 Build complete! Ready to commit and push.');
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}
