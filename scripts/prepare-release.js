'use strict';
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
function option(name) {const i=args.indexOf(name);return i<0?'':args[i+1]||'';}
const publisher = option('--publisher');
const repository = option('--repository');
if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(publisher) || publisher === 'local8086') throw new Error('Provide your registered Marketplace publisher ID; local8086 is a placeholder.');
if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error('Repository must be GitHub OWNER/REPO.');
const filename=path.resolve(__dirname,'..','package.json');
const manifest=JSON.parse(fs.readFileSync(filename,'utf8'));
manifest.publisher=publisher;
manifest.repository={type:'git',url:`https://github.com/${repository}.git`};
manifest.homepage=`https://github.com/${repository}#readme`;
manifest.bugs={url:`https://github.com/${repository}/issues`};
fs.writeFileSync(filename,JSON.stringify(manifest,null,2)+'\n');
console.log(`Publisher: ${publisher}; repository: ${repository}; version: ${manifest.version}`);
