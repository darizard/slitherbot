document.addEventListener('DOMContentLoaded', initializeNavbar);
function initializeNavbar() {
    const ul = document.querySelector('#main-nav')
        ?.appendChild(document.createElement('ul'));
    navItems.forEach((item) => {
        const a = ul?.appendChild(document.createElement('li'))
            .appendChild(document.createElement('a'));
        if (a) {
            a.href = item.href;
            a.textContent = item.label;
        }
    });
    const githubLI = ul?.appendChild(document.createElement('li'))
        .appendChild(document.createElement('a'));
    if (githubLI) {
        githubLI.href = "https://github.com/darizard/slitherbot";
        githubLI.target = "_blank";
        githubLI.rel = "noopener noreferrer";
    }
    const img = githubLI?.appendChild(document.createElement('img'));
    if (img)
        img.src = "/slither/public/media/dari-github-400px.png";
}
export {};
