import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

const errors = [];
const expectedReact = '18.2.0';
const expectedScheduler = '0.23.2';

function check(label, got, expected) {
  if (got !== expected) {
    errors.push(`${label}: expected ${expected}, got ${got ?? 'undefined'}`);
  }
}

check('package.json dependencies.react', pkg.dependencies?.react, expectedReact);
check('package.json dependencies.react-dom', pkg.dependencies?.['react-dom'], expectedReact);
check('package-lock root dependencies.react', lock.packages?.['']?.dependencies?.react, expectedReact);
check('package-lock root dependencies.react-dom', lock.packages?.['']?.dependencies?.['react-dom'], expectedReact);
check('package-lock node_modules/react version', lock.packages?.['node_modules/react']?.version, expectedReact);
check('package-lock node_modules/react-dom version', lock.packages?.['node_modules/react-dom']?.version, expectedReact);
check('package-lock node_modules/scheduler version', lock.packages?.['node_modules/scheduler']?.version, expectedScheduler);

if (errors.length) {
  console.error('\nDependency sync check failed:\n');
  for (const err of errors) console.error(`- ${err}`);
  console.error('\nFix: run npm install locally and commit both package.json and package-lock.json together.');
  process.exit(1);
}

console.log('Dependency sync check passed (React 18.2.0 / scheduler 0.23.2).');
