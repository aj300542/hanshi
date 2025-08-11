// 拖拽逻辑（调优）
let isDown = false;
let startX;
let scrollLeft;
let lastWalk = 0;

thumbBar.addEventListener('mousedown', (e) => {
    isDown = true;
    thumbBar.classList.add('dragging');
    startX = e.pageX - thumbBar.offsetLeft;
    scrollLeft = thumbBar.scrollLeft;
});

thumbBar.addEventListener('mouseleave', () => {
    isDown = false;
    thumbBar.classList.remove('dragging');
});

thumbBar.addEventListener('mouseup', () => {
    isDown = false;
    thumbBar.classList.remove('dragging');

    let inertia = Math.max(Math.min(lastWalk * 1.2, 50), -50);
    const friction = 0.9;
    const step = () => {
        if (Math.abs(inertia) < 0.5) return;
        thumbBar.scrollLeft -= inertia;
        inertia *= friction;
        requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
});

thumbBar.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - thumbBar.offsetLeft;
    const speedFactor = 0.45;
    const walk = (x - startX) * speedFactor;
    lastWalk = walk * 1.2;
    thumbBar.scrollLeft = scrollLeft - walk;
});