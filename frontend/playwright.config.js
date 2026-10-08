import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e', fullyParallel:false, workers:1, timeout:30000,
 use:{baseURL:process.env.PLAYWRIGHT_BASE_URL||'http://localhost:5173',channel:'chrome',screenshot:'only-on-failure',trace:'retain-on-failure'},
 reporter:'list',
});
