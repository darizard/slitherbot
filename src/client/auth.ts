(async () => {
    
    const refreshResult: Response & { error?: string } = await fetch('/slither/auth/refresh', { method: 'POST' });

    if(!refreshResult.ok) {
        console.log(JSON.stringify(refreshResult.error));
        window.location.href = '/slither/auth';
    }

})();