import {test,expect} from '@playwright/test';
// Requires the actual FastAPI server at the frontend's configured API URL.
test('React uses real history, scenario, profit, farmer and chat endpoints',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const scenario=page.waitForResponse(r=>r.url().includes('/api/scenario')&&r.request().method()==='POST');
 await page.goto('/dashboard');expect((await scenario).status()).toBe(200);await expect(page.getByText('Connected to the API: Synthetic demo history.')).toBeVisible();
 await expect(page.locator('.recharts-area-curve')).toHaveCount(3);
 const history=page.waitForResponse(r=>r.url().includes('/api/prices/history'));
 await page.goto('/history');expect((await history).status()).toBe(200);await expect(page.getByText('Loaded from the history API.')).toBeVisible();
 await page.goto('/profit');await expect(page.getByText('Calculated by the API')).toBeVisible();
 await page.getByLabel('Quantity (quintals)',{exact:true}).fill('10');await page.getByLabel('Price override').fill('1000');
 for(const label of ['Transport (₹ / quintal / km)','Loading (₹ / quintal)','Market charges (%)','Storage (₹ / quintal / day)','Daily spoilage (%)'])await page.getByLabel(label,{exact:true}).fill('0');
 await expect(page.locator('.profit-total')).toHaveText('₹10,000');
 await page.goto('/profile');await page.getByLabel('Farm or farmer name').fill('Integration test farm');
 const create=page.waitForResponse(r=>r.url().endsWith('/api/farmers')&&r.request().method()==='POST');await page.getByRole('button',{name:'Save farmer profile'}).click();
 const farmer=(await(await create).json()).data;await expect(page.getByRole('status')).toContainText('saved to the API');
 await page.getByLabel('Quantity (quintals)',{exact:true}).fill('25');
 const update=page.waitForResponse(r=>r.url().endsWith(`/api/farmers/${farmer.id}`)&&r.request().method()==='PUT');await page.getByRole('button',{name:'Save farmer profile'}).click();expect((await update).status()).toBe(200);
 const get=page.waitForResponse(r=>r.url().endsWith(`/api/farmers/${farmer.id}`)&&r.request().method()==='GET');await page.reload();expect((await get).status()).toBe(200);await expect(page.getByLabel('Quantity (quintals)',{exact:true})).toHaveValue('25');
 await page.getByRole('button',{name:'Open Kisan Vaani assistant'}).click();await page.getByLabel('Ask Kisan Vaani').fill('Explain market charges');
 const chat=page.waitForResponse(r=>r.url().endsWith('/api/chat')&&r.request().method()==='POST');await page.getByRole('button',{name:'Send question'}).click();expect((await chat).status()).toBe(200);await expect(page.locator('.assistant-messages .chat-bubble')).toHaveCount(3);
 expect(errors).toEqual([]);
});
