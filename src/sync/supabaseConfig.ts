// Where BudgetFlow syncs to. Both values are public by design: they ship in the
// website's code to every visitor. They only identify the project — access is
// controlled by the row-level security rules in supabase/vaults.sql, and the
// data itself is end-to-end encrypted (src/crypto/vault.ts).
//
// Never put the secret / service_role key here: it bypasses every rule.

export const SUPABASE_URL = 'https://gntfgoinspsabvhbqmvi.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_Ejh6RrpBIPktp3h-HCpt4A_d9SQWjjS';
