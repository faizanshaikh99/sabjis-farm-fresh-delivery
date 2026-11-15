import fs from 'fs';
import path from 'path';
import { verifySupabaseConnection } from './supabaseService';
import { runSupabaseMigration, SupabaseMigrationInput } from './migrateSupabase';

function readJsonArray(filePath: string): any[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err: any) {
    console.warn(`⚠️ Could not parse ${path.basename(filePath)}: ${err.message}`);
    return [];
  }
}

function readJsonObject(filePath: string): any | null {
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, 'utf-8').trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err: any) {
    console.warn(`⚠️ Could not parse ${path.basename(filePath)}: ${err.message}`);
    return null;
  }
}

export function loadBackendJsonStores(dataDir = path.join(process.cwd(), 'backend-data')): SupabaseMigrationInput {
  return {
    usersStore: readJsonArray(path.join(dataDir, 'users.json')),
    categoriesStore: readJsonArray(path.join(dataDir, 'categories.json')),
    productsStore: readJsonArray(path.join(dataDir, 'products.json')),
    offersStore: readJsonArray(path.join(dataDir, 'offers.json')),
    reviewsStore: readJsonArray(path.join(dataDir, 'reviews.json')),
    couponsStore: readJsonArray(path.join(dataDir, 'coupons.json')),
    paymentSettingsStore: readJsonObject(path.join(dataDir, 'payment_settings.json')),
    businessSettingsStore: readJsonObject(path.join(dataDir, 'business_settings.json')),
    paymentMethodDiscountsStore: readJsonArray(path.join(dataDir, 'payment_method_discounts.json')),
    addressesStore: readJsonArray(path.join(dataDir, 'addresses.json')),
    ordersStore: readJsonArray(path.join(dataDir, 'orders.json')),
    paymentTransactionsStore: readJsonArray(path.join(dataDir, 'payment_transactions.json')),
    redemptionLogsStore: readJsonArray(path.join(dataDir, 'redemption_logs.json')),
    notificationsStore: readJsonArray(path.join(dataDir, 'notifications.json')),
    passwordResetsStore: readJsonArray(path.join(dataDir, 'password_resets.json')),
    sessionsStore: readJsonArray(path.join(dataDir, 'sessions.json')),
    loginHistoryStore: readJsonArray(path.join(dataDir, 'login_history.json')),
    auditLogsStore: readJsonArray(path.join(dataDir, 'audit_logs.json'))
  };
}

export async function importJsonFilesToSupabase(options?: {
  dryRun?: boolean;
  dataDir?: string;
}): Promise<{ success: boolean; message: string; counts?: Record<string, number> }> {
  const dryRun = Boolean(options?.dryRun);
  const stores = loadBackendJsonStores(options?.dataDir);

  if (!dryRun) {
    const conn = await verifySupabaseConnection();
    if (!conn.isConfigured || !conn.connected) {
      return {
        success: false,
        message: `Cannot import to Supabase: ${conn.message}`
      };
    }
  }

  return await runSupabaseMigration(stores, {
    dryRun,
    preserveExistingUsers: true
  });
}

// Execute CLI only when invoked directly (`npx tsx src/db/importJsonToSupabase.ts [--dry-run]`)
const entryScript = process.argv[1] || '';
if (entryScript.endsWith('importJsonToSupabase.ts') || entryScript.endsWith('importJsonToSupabase.js')) {
  const isDryRun = process.argv.includes('--dry-run');
  importJsonFilesToSupabase({ dryRun: isDryRun })
    .then(result => {
      console.log('\n📦 Import Result:', JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('❌ Import failed:', err);
      process.exit(1);
    });
}
