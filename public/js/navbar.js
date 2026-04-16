document.addEventListener('DOMContentLoaded', initializeNavbar);

function initializeNavbar() {

    const ul = document.querySelector('#main-nav')
                       .appendChild(document.createElement('ul'));

    navItems.forEach((item) => {

        const a = ul.appendChild(document.createElement('li'))
                    .appendChild(document.createElement('a'));

        a.href = item.href;
        a.textContent = item.label;
        a.target = "_blank";
        a.rel = "noopener noreferrer";

    })

    const a = ul.appendChild(document.createElement('li'))
      .appendChild(document.createElement('a'));

    a.href = "https://github.com/darizard/slitherbot";
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const img = a.appendChild(document.createElement('img'));
    img.src = "/slither/media/dari-badge-silhouette-nocorners-400px.png";

}