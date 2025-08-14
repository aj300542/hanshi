const scrollLine = document.getElementById('scroll-line');
const container = document.querySelector('.scroll-container');
const spaceCount = 3;
const spacer = "&nbsp;".repeat(spaceCount);
const speed = 100; // 每秒滚动 100px

fetch(`${charsPath}poemT.json`)
    .then(res => res.json())
    .then(data => {
        const lines = data.map(item => item.note);
        scrollLine.innerHTML = lines.join(spacer);

        const textWidth = scrollLine.offsetWidth;
        const containerWidth = container.offsetWidth;
        const totalDistance = containerWidth + textWidth;
        const duration = totalDistance / speed * 1000; // 毫秒

        function animateScroll() {
            const startTime = performance.now();

            function animate(time) {
                const elapsed = time - startTime;
                const progress = elapsed / duration;
                const x = containerWidth - totalDistance * progress;
                scrollLine.style.transform = `translateX(${x}px)`;

                if (x + textWidth > 0) {
                    requestAnimationFrame(animate);
                } else {
                    scrollLine.style.transform = `translateX(${containerWidth}px)`;
                    requestAnimationFrame(() => animateScroll());
                }
            }

            requestAnimationFrame(animate);
        }

        animateScroll();
    })
    .catch(err => {
        console.error("❌ poemT.json 加载失败:", err);
        scrollLine.textContent = "加载失败，请检查 poemT.json 文件路径或格式。";
    });
