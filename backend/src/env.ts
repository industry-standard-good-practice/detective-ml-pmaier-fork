import dotenv from 'dotenv';

// Load static configuration committed to git
dotenv.config();

// Load secrets from gitignored .env.local, overriding any conflicts
dotenv.config({ path: '.env.local', override: true });
