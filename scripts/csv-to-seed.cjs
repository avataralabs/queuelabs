const fs = require('fs');
const path = require('path');

// CSV files mapping to tables
const csvFiles = [
  {
    file: path.join(process.env.HOME, 'Downloads/query-results-export-2026-01-30_07-28-05.csv'),
    table: 'auth.users',
    columns: ['id', 'email', 'created_at', 'raw_user_meta_data'],
    generateAuthUser: true
  },
  {
    file: path.join(process.env.HOME, 'Downloads/query-results-export-2026-01-30_07-27-25.csv'),
    table: 'public.user_roles',
    columns: ['id', 'user_id', 'role', 'is_approved', 'created_at']
  },
  {
    file: path.join(process.env.HOME, 'Downloads/query-results-export-2026-01-30_07-26-07.csv'),
    table: 'public.profiles',
    columns: ['id', 'name', 'platform', 'created_at', 'user_id', 'uploadpost_username', 'connected_accounts', 'access_url', 'access_url_expires_at']
  },
  {
    file: path.join(process.env.HOME, 'Downloads/query-results-export-2026-01-30_07-27-06.csv'),
    table: 'public.schedule_slots',
    columns: ['id', 'profile_id', 'hour', 'minute', 'is_active', 'type', 'week_days', 'user_id', 'platform']
  },
  {
    file: path.join(process.env.HOME, 'Downloads/query-results-export-2026-01-30_07-26-42.csv'),
    table: 'public.contents',
    columns: ['id', 'file_name', 'caption', 'file_size', 'file_url', 'uploaded_at', 'assigned_profile_id', 'scheduled_at', 'scheduled_slot_id', 'status', 'removed_at', 'removed_from_profile_id', 'user_id', 'description', 'platform', 'uploadpost_request_id', 'is_locked', 'webhook_response', 'retry_count', 'next_retry_at', 'webhook_call_id']
  },
  {
    file: path.join(process.env.HOME, 'Downloads/query-results-export-2026-01-30_07-27-45.csv'),
    table: 'public.upload_history',
    columns: ['id', 'content_id', 'profile_id', 'uploaded_at', 'status', 'error_message', 'user_id']
  }
];

// Parse CSV with semicolon delimiter and handle quoted fields
function parseCSV(content) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    const nextChar = content[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        // Escaped quote
        currentField += '"';
        i++;
      } else if (char === '"') {
        // End of quoted field
        inQuotes = false;
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ';') {
        currentRow.push(currentField);
        currentField = '';
      } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
        if (char === '\r') i++;
      } else if (char !== '\r') {
        currentField += char;
      }
    }
  }

  // Handle last field
  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    if (currentRow.length > 1 || currentRow[0] !== '') {
      rows.push(currentRow);
    }
  }

  return rows;
}

// Escape SQL string
function escapeSQL(value) {
  if (value === null || value === undefined || value === '') {
    return 'NULL';
  }

  // Handle boolean
  if (value === 'true' || value === true) return 'true';
  if (value === 'false' || value === false) return 'false';

  // Handle numbers
  if (/^\d+$/.test(value)) return value;

  // Handle JSON (starts with [ or {)
  if ((value.startsWith('[') || value.startsWith('{')) && (value.endsWith(']') || value.endsWith('}'))) {
    return `'${value.replace(/'/g, "''")}'::jsonb`;
  }

  // Handle UUID
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return `'${value}'`;
  }

  // Handle timestamps
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    return `'${value}'`;
  }

  // Regular string
  return `'${value.replace(/'/g, "''")}'`;
}

// Generate INSERT statement for auth.users (special handling)
function generateAuthUserInsert(row, headers) {
  const data = {};
  headers.forEach((h, i) => {
    data[h] = row[i];
  });

  const id = data.id;
  const email = data.email;
  const createdAt = data.created_at;
  const rawUserMetaData = data.raw_user_meta_data || '{}';

  // Generate a fake encrypted password (for seeding only)
  const encryptedPassword = '$2a$10$PznXR4plgfMJpVFTJd0G1OE8qcQHMVjQwYqKnXbJpJqJqJqJqJqJq';

  return `INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, role, aud, confirmation_token, recovery_token, email_change_token_new, email_change)
VALUES (
  '${id}',
  '00000000-0000-0000-0000-000000000000',
  '${email}',
  '${encryptedPassword}',
  '${createdAt}',
  '${createdAt}',
  '${createdAt}',
  '{"provider":"email","providers":["email"]}'::jsonb,
  ${escapeSQL(rawUserMetaData)},
  false,
  'authenticated',
  'authenticated',
  '',
  '',
  '',
  ''
);`;
}

// Generate INSERT statements for a table
function generateInserts(rows, table, targetColumns, generateAuthUser = false) {
  if (rows.length < 2) return '';

  const headers = rows[0];
  const dataRows = rows.slice(1);

  const inserts = [];

  for (const row of dataRows) {
    if (generateAuthUser) {
      inserts.push(generateAuthUserInsert(row, headers));
      continue;
    }

    const values = targetColumns.map(col => {
      const headerIndex = headers.indexOf(col);
      if (headerIndex === -1) return 'NULL';
      return escapeSQL(row[headerIndex]);
    });

    inserts.push(`INSERT INTO ${table} (${targetColumns.join(', ')}) VALUES (${values.join(', ')});`);
  }

  return inserts.join('\n');
}

// Main
async function main() {
  let sql = `-- Seed file generated from CSV exports
-- Generated at: ${new Date().toISOString()}

-- Disable triggers temporarily for seeding
SET session_replication_role = replica;

`;

  for (const config of csvFiles) {
    console.log(`Processing ${config.file}...`);

    if (!fs.existsSync(config.file)) {
      console.log(`  File not found, skipping`);
      continue;
    }

    const content = fs.readFileSync(config.file, 'utf-8');
    const rows = parseCSV(content);

    console.log(`  Found ${rows.length - 1} rows`);

    sql += `\n-- ${config.table}\n`;
    sql += `-- ${rows.length - 1} rows\n`;
    sql += generateInserts(rows, config.table, config.columns, config.generateAuthUser);
    sql += '\n';
  }

  sql += `
-- Re-enable triggers
SET session_replication_role = DEFAULT;
`;

  const outputPath = path.join(__dirname, '..', 'supabase', 'seed.sql');
  fs.writeFileSync(outputPath, sql);
  console.log(`\nSeed file written to: ${outputPath}`);
}

main().catch(console.error);
