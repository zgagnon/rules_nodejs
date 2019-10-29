// Adapt node programs to run under Bazel
// Meant to be run in a --require hook

const fs = require('fs');
const path = require('path');
const util = require('util')

if(global.BAZEL_NODE_PATCHES) {
  //console.error('BNP: &&&&&&&&&&&&& node already patched.')
  return;
}


const LINK_ROOT = process.env.RUNFILES?process.env.RUNFILES.split('/execroot/')[0]+'/execroot':'/'


global.BAZEL_NODE_PATCHES = true;

//console.error('BNP:('+process.pid+') **************** ',JSON.stringify(process.execArgv),JSON.stringify(process.argv));

const nodeDir = path.join(__dirname,'_node_bin');
if(!process.env.PATCHED_NODEJS && !fs.existsSync(nodeDir)){

  fs.mkdirSync(nodeDir)
  fs.writeFileSync(path.join(nodeDir,'node'),`#!/bin/bash
echo "BNP: nodejs wrapper script" 1>2
export PATCHED_NODEJS=1
export PATH=${nodeDir}:$PATH
hasscript=\`echo "$@" | grep ${path.basename(__filename)}\`
if [ "$hasscript"=="" ]; then
  exec ${process.execPath} --require "${__filename}" "$@"
else
  exec ${process.execPath} "$@"
fi
`,{mode:0o777});


  //console.error(`BNP: nodeDir created ${nodeDir}`)

} else {

  //console.error('BNP: ))))))) loader alreday loaded. child process?')
  // remove this loader from execargv otherwise it may get added twice?
  //process.execArgv
}

if(!process.env.PATH){
  //console.error('BNP: PATH not set. adding node wrapper')
  process.env.PATH = nodeDir;
} else if(process.env.PATH.indexOf(nodeDir+path.delimiter) === -1) {
  //console.error('BNP: adding node wrapper to PATH')
  process.env.PATH = nodeDir+path.delimiter+process.env.PATH;
}

process.argv[0] = process.execPath = path.join(nodeDir,'node')

let file = path.basename(__filename)
process.execArgv.map((v)=>{
  if(v.indexOf(file) > -1){
    return __filename;
  }
  return v;
})


const orig = {};
// TODO: more functions need patched like
// the async and native versions
orig['realpath'] = fs.realpath;
orig['realPathSync'] = fs.realpathSync;
orig['lstat'] = fs.lstat;
orig['lstatSync'] = fs.lstatSync;
orig['readlink'] = fs.readlink;
orig['readlinkSync'] = fs.readlinkSync;
orig['readlinkSync'] = fs.readlinkSync;
// To fully resolve a symlink requires recursively
// following symlinks until the target is a file
// rather than a symlink, so we must make this look
// like a file.
function lstatSync(p) {
  //console.error('BNP: fs.lstatSync',p)
  return fs.statSync(p);
}

function lstat(p,cb){ 
  //console.error('BNP: fs.lstat',p)
  fs.stat(p,cb)
}

function realpath(p,cb){
  //console.error('BNP: fs.realpath',p)
  setImmediate(()=>{
    let res = path.resolve(p)
    cb(false,res)
  })
}

function realpathSync(p) {
  //console.error('BNP: fs.realpathSync',p)
  let res = path.resolve(p)
  // Realpath returns an absolute path, so we should too
  return res;
}

function readlink(p,cb){
  //console.error('BNP: fs.readlink',p)
  orig.readlink(p,(err,resolved)=>{
    if(err) return cb(err);
    // return absolute path passed in because this is a real link.
    // how did it know?
    let res = path.resolve(p);
    if(res === p){
      let e =  new Error('EINVAL: invalid argument, readlink \''+p+'\'')
      e.code = 'EINVAL';
      return cb(e);
    }
    cb(false,res)
  })
}

function readlinkSync(p){
  //console.error('BNP: fs.readlinkSync',p)
  // throw all the errors i would have.
  let readLinkRes = orig.readlinkSync(p);

  let result = path.resolve(p);
  if(p === result){ 
    let e =  new Error('EINVAL: invalid argument, readlink \''+p+'\'')
    e.code = 'EINVAL';
    throw e
  }
  return result;
}

if(fs.Dirent){
  // not the righ patch 
  //fs.Dirent.prototype.isSymbolicLink = ()=>{
  //  return false;
  //}
}

function monkeypatch() {
  fs.realpathSync = realpathSync;
  fs.lstatSync = lstatSync;
  fs.realpath = realpath;
  fs.realpathSync = realpathSync;
  fs.readlink = readlink;
  fs.readlinkSync = readlinkSync;

  if(fs.promises){
    fs.promises.realpath = util.promisify(fs.realpath)
    fs.promises.readlink = util.promisify(fs.readlink)
    fs.promises.lstat = util.promisify(fs.lstat)
  }
}

monkeypatch();
