import fs from 'fs';
const files = fs.readdirSync('web/dist/assets').filter((f) => f.endsWith('.js'));
for (const f of files) {
  const j = fs.readFileSync(`web/dist/assets/${f}`, 'utf8');
  console.log(f, {
    myProfile: j.includes('myProfile'),
    myProfileText: j.includes('My Profile'),
    profileSubtitle: j.includes('Account details and security'),
    UserProfile: j.includes('Loading profile'),
  });
}
