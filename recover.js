const base=new URL('./',document.currentScript.src);base.searchParams.set('return',location.pathname+location.search+location.hash);location.replace(base.href);
