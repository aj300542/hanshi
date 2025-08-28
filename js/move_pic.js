const el = document.querySelector('.cover-smallRu');
let posX = 100;
let posY = 100;
let velocityX = 1.2;
let velocityY = 0.8;

function animate() {
    const maxX = window.innerWidth - el.offsetWidth;
    const maxY = window.innerHeight - el.offsetHeight;

    // 更新位置
    posX += velocityX;
    posY += velocityY;

    // 边界反弹
    if (posX <= 0 || posX >= maxX) velocityX *= -1;
    if (posY <= 0 || posY >= maxY) velocityY *= -1;

    el.style.left = posX + 'px';
    el.style.top = posY + 'px';

    requestAnimationFrame(animate);
}

animate();