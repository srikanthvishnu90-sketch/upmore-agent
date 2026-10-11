/* Device-local private records are scoped, never assigned by legacy key alone.
   Unscoped legacy values are preserved but not read as anybody's finances. */
globalThis.UpmorePrivateFinance = function ({storage,workspaceStorage,identity,uuid}) {
  let generation=0;
  const marker='upmore-private-guest-workspace';
  const isPrivate=key => /^(cfo_|claim_|upmore_(tx_|budget_|custom_cats|keep_target|goals|household|holdings|plaid|inv_|nw_|buffer|last_sync|confirmed_dup|rec_dismissed|private_|dob_year|minor_block|negcash|dismissed))/.test(key) || /^upmore-(onboarding-|cancel-|recharged-|dismiss|task-overlay|muted-types|mute-asked|prefs|ref(?:-|$))/.test(key);
  const owner=()=>identity() || null;
  function workspace(create=false) {
    const user=owner();if(user)return 'user:'+user;
    let guest=workspaceStorage.getItem(marker);
    if(!guest && create){guest=uuid();workspaceStorage.setItem(marker,guest);}
    return guest ? 'guest:'+guest : null;
  }
  function keyFor(key,create=false){if(!isPrivate(key))return key;const scope=workspace(create);return scope?'upmore-private:'+scope+':'+key:null;}
  function keys(){const values=[];const scope=workspace(),prefix=scope?'upmore-private:'+scope+':':null;
    for(let i=0;i<storage.length;i++){const key=storage.key(i);if(!key)continue;if(prefix && key.startsWith(prefix))values.push(key.slice(prefix.length));else if(!key.startsWith('upmore-private:') && !isPrivate(key))values.push(key);}
    return values;
  }
  function capture(){const original=owner(),at=generation;return {owner:original,current:()=>generation===at && owner()===original};}
  return {isPrivate,capture,keys,key:index=>keys()[index],get length(){return keys().length;},
    getItem(key){const scoped=keyFor(key);return scoped?storage.getItem(scoped):null;},
    setItem(key,value){storage.setItem(keyFor(key,true),value);},
    removeItem(key){const scoped=keyFor(key);if(scoped)storage.removeItem(scoped);},
    invalidate(rotateGuest=false){generation++;if(rotateGuest)workspaceStorage.removeItem(marker);}
  };
};
