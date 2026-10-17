'use strict';
// TEMPLATE ONLY. Mounted by the owner after separate hosting/credential and
// deployment approval. Never load this path/module from a chat request.
const path=require('node:path'),fs=require('node:fs');
const codeRoot=process.env.UPMORE_WORKER_CODE_ROOT||'/app';
const {createSyncRPCTransport}=require(path.join(codeRoot,'workers/career-browser/rpc-transport.cjs'));
const {createTaskAuthority}=require(path.join(codeRoot,'workers/career-browser/authority.cjs'));
const {workerIdentity}=require(path.join(codeRoot,'workers/career-browser/worker-identity.cjs'));
const required=name=>{const value=process.env[name];if(!value)throw Error('Missing '+name);return value;};
const stateRoot=required('UPMORE_STATE_DIR');
if(!path.isAbsolute(stateRoot))throw Error('UPMORE_STATE_DIR must be absolute');
const equipmentModule=required('UPMORE_APPROVED_EQUIPMENT_MODULE');
if(!path.isAbsolute(equipmentModule))throw Error('approved equipment module must be absolute');
const equipment=require(equipmentModule); // owner/epoch/version checks required; no synthesized facts
const transport=createSyncRPCTransport({url:required('UPMORE_SUPABASE_URL'),key:required('UPMORE_EXISTING_RPC_KEY'),stateRoot});
module.exports={mode:'pull_only',storeRoot:path.join(stateRoot,'tasks'),evidenceRoot:path.join(stateRoot,'evidence'),evidenceRequired:true,
 authority:createTaskAuthority({...transport,workerId:workerIdentity(path.join(stateRoot,'identity'))}),resolveEquipment:equipment.resolveEquipment,readReceipt:equipment.readReceipt,
 // This file can register only controlled loopback portals. It cannot turn
 // on a real employer; the existing worker rejects such a registration.
 controlledPortals:process.env.UPMORE_CONTROLLED_PORTALS_FILE?JSON.parse(fs.readFileSync(process.env.UPMORE_CONTROLLED_PORTALS_FILE,'utf8')):[],
 maxActions:120,timeoutMs:120000,runner:{intervalMs:5000,maxTasks:1,maxRunMs:900000,maxErrors:3},close:()=>transport.close()};
