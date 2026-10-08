import {test,expect} from '@playwright/test';
test.beforeEach(async({page})=>{
 await page.route('**/api/scenario',route=>route.abort());
 await page.route('**/api/profit',route=>route.abort());
 await page.route('**/api/farmers**',route=>route.abort());
 await page.route('**/api/weather?**',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({detail:'Weather provider unavailable for this test.'})}));
 await page.route('**/api/chat',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({meta:{price_unit:'INR/quintal',quantity_unit:'quintal',request_id:'mock'},data:{mode:'offline',answer:'Verify actual mandi prices before selling. These prices are synthetic.'}})}));
});
test('landing, routes, demo fallback and assistant work without the backend',async({page})=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('/');await expect(page.getByRole('heading',{name:'Your crop. The right mandi. The right time.'})).toBeVisible();
 await page.getByRole('link',{name:'Plan my next sale'}).click();
 await expect(page.getByText('Backend unavailable — showing a browser demo projection.')).toBeVisible();
 await expect(page.getByRole('table')).toBeVisible();
 await page.screenshot({path:'/private/tmp/cropbazaar-dashboard.png',fullPage:true});
 const routes=[['MandiSense','Know the rhythm of your market.'],['Bhavishya','Plan the next seven days.'],['Mandi Khoj','Go where your harvest earns more.'],['BechSmart','Sell, wait or switch?'],['Munafa Meter','From market price to real return.'],['Jokhim Engine','A good plan leaves room for uncertainty.'],['KisanTwin','Make this workspace yours.'],['Kyun Nahi?','Every recommendation should make sense.']];
 for(const[name,heading]of routes){await page.getByRole('navigation',{name:'Farmer workspace'}).getByRole('link',{name,exact:true}).click();await expect(page.getByRole('heading',{name:heading})).toBeVisible();}
 await page.getByRole('button',{name:'Explain my decision'}).click();await expect(page.getByText('Offline guidance',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Open Kisan Vaani assistant'}).click();await page.getByLabel('Ask Kisan Vaani').fill('Should I sell now?');await page.getByRole('button',{name:'Send question'}).click();await expect(page.getByRole('dialog',{name:'Kisan Vaani farming assistant'}).getByText('Offline guidance',{exact:true})).toBeVisible();
 await page.getByLabel('Ask Kisan Vaani').press('Escape');await expect(page.getByRole('dialog',{name:'Kisan Vaani farming assistant'})).toHaveCount(0);
 expect(errors).toEqual([]);
});
test('calculator computes entered price and zero costs; search shows empty state',async({page})=>{
 await page.goto('/profit');await expect(page.getByText('Your sale scenario')).toBeVisible();
 await page.getByLabel('Quantity (quintals)',{exact:true}).fill('10');await page.getByLabel('Price override').fill('1000');
 for(const label of ['Transport (₹ / quintal / km)','Loading (₹ / quintal)','Market charges (%)','Storage (₹ / quintal / day)','Daily spoilage (%)'])await page.getByLabel(label,{exact:true}).fill('0');
 await expect(page.locator('.profit-total')).toHaveText('₹10,000');
 await page.goto('/mandis');await page.getByLabel('Search mandis').fill('Unknown market');await expect(page.getByRole('heading',{name:'No matching mandis'})).toBeVisible();await page.getByRole('button',{name:'Clear search'}).click();await expect(page.locator('.mandi-card')).toHaveCount(3);
});
test('mobile menu, profile persistence, forecast controls and no horizontal overflow',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/dashboard');
 await page.getByRole('button',{name:'Open navigation'}).click();await expect(page.locator('.mobile-drawer')).toBeVisible();await page.locator('.mobile-drawer').getByRole('link',{name:'KisanTwin'}).click();await expect(page.locator('.mobile-drawer')).not.toBeVisible();
 await page.getByLabel('Quantity (quintals)',{exact:true}).fill('30');await page.getByLabel('Selling urgency').selectOption('Sell today');await page.getByRole('button',{name:'Save farmer profile'}).click();await expect(page.getByRole('status')).toContainText('Profile applied');
 await page.reload();await expect(page.getByLabel('Quantity (quintals)',{exact:true})).toHaveValue('30');
 await page.getByRole('button',{name:'Open navigation'}).click();await page.locator('.mobile-drawer').getByRole('link',{name:'Bhavishya'}).click();await page.getByLabel('Horizon').selectOption('3');await expect(page.getByRole('row')).toHaveCount(4);
 await page.screenshot({path:'/private/tmp/cropbazaar-mobile.png',fullPage:true});
 for(const route of ['/','/dashboard','/history','/forecast','/mandis','/recommendation','/profit','/risks','/profile','/explanation']){await page.goto(route);await expect(page.getByRole('heading',{level:1})).toBeVisible();await page.waitForTimeout(200);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),`Horizontal overflow on ${route}`).toBe(true);}
});
