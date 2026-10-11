// A missing user credential is a disconnected account. Never substitute
// the legacy global credential, even for an account with a connection row.
export async function ownerBankAccessUrl(supabaseUrl:string,serviceKey:string,userId:string,fetcher:typeof fetch=fetch):Promise<string|null> {
  if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(userId)) throw new Error("Verified bank owner required.");
  const name=`simplefin_access_url_${userId}`;
  const response=await fetcher(`${supabaseUrl}/rest/v1/vault_secrets?select=secret&name=eq.${encodeURIComponent(name)}`,{
    headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`},
  });
  if(!response.ok)throw new Error("Bank credential storage unavailable.");
  const rows=await response.json();
  if(!Array.isArray(rows))throw new Error("Bank credential storage unavailable.");
  if(rows.length===0)return null;
  if(rows.length!==1 || typeof rows[0]?.secret!=="string" || !rows[0].secret)throw new Error("Bank credential storage unavailable.");
  return rows[0].secret;
}
