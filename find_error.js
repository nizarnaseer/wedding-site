#!/usr/bin/env node
const fs = require('fs');
const src = fs.readFileSync('/Users/nizarnaseer/Documents/photography-portfolio/app.js', 'utf8');

// Binary search for the syntax error
const lines = src.split('\n');
let lo = 0, hi = lines.length;

function testLines(end) {
  // Wrap in a function to avoid top-level await issues
  const chunk = lines.slice(0, end).join('\n');
  try {
    new Function(chunk);
    return true;
  } catch(e) {
    return false;
  }
}

// First check the whole file
if (testLines(lines.length)) {
  console.log('✅ File is valid!');
  process.exit(0);
}

console.log('❌ File has syntax error. Binary searching...');

// Binary search
while (lo < hi - 1) {
  const mid = Math.floor((lo + hi) / 2);
  if (testLines(mid)) {
    lo = mid;
  } else {
    hi = mid;
  }
}

// Get the exact error
try {
  new Function(lines.slice(0, hi).join('\n'));
} catch(e) {
  console.log('Error near line ' + hi + ': ' + e.message);
  console.log('Context:');
  for (let i = Math.max(0, hi-5); i < Math.min(lines.length, hi+3); i++) {
    console.log((i+1) + ': ' + lines[i]);
  }
}
