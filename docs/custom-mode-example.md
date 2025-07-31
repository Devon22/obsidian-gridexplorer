---
date: 2025-06-26
---
1. My Favorites
```
return dv.pages("#Favorites").sort(page => page.modified_date ? dv.date(page.modified_date) : page.file.mtime, 'desc');
```

2. On This Day in History
```
const today = new Date();
return dv.pages().where(p => {
	const pageDate = p.modified_date ? new Date(p.modified_date): new Date(p.file.mtime);
	return pageDate.getYear() !== today.getYear() &&
		pageDate.getMonth() === today.getMonth() && 
		pageDate.getDate() === today.getDate();
});
```

3. Backlinks
```
const currentPage = dv.current();
if (!currentPage) return [];
return dv.pages().where(p => p.file.outlinks.includes(currentPage.file.link) && p.file.path.split('/').length > 1).sort(page => page.modified_date ? dv.date(page.modified_date) : page.file.mtime, 'desc');
```

4. Random Images
```
const files = app.vault.getFiles();
const imageFiles = files.filter(file =>  
   file.path.startsWith("resources/") && 
    /\.(png|jpg|jpeg|gif|bmp|svg|webp)$/i.test(file.name)
);
return imageFiles
  .sort(() => 0.5 - Math.random())
  .slice(0, 10)
  .map(f => ({ file: f }));
```

5. Random Videos
```
const files = app.vault.getFiles();
const videoFiles = files.filter(file =>  
   file.path.startsWith("resources/") && 
    /\.(mp4|webm|mov|avi|mkv|ogv)$/i.test(file.name)
);
return videoFiles
  .sort(() => 0.5 - Math.random())
  .slice(0, 10)
  .map(f => ({ file: f }));
```