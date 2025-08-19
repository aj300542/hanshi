const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const vh = canvas.height / 100;
//const vw = canvas.width / 100; // 可选保留，仅用于居中计算

const styles = getComputedStyle(document.documentElement);
const circleRadius = parseFloat(styles.getPropertyValue('--circle-radius-vh')) * vh;
const circleColor = styles.getPropertyValue('--circle-color').trim();
const ribbonColor = styles.getPropertyValue('--ribbon-color').trim();

const circle = {
    x: canvas.width / 2,
    y: 40 * vh,
    angle: 0,
    speed: 0.01,
    head: {
        radius: circleRadius,
        color: circleColor
    }
};

let lastCircleX = circle.x;
let lastCircleY = circle.y;
let headVelocity = { x: 0, y: 0 };
const inertiaFactor = 0.6; // 头部运动惯性影响
const followSpeed = 0.2;

const ribbonPerSide = 18;
const ribbonCount = ribbonPerSide * 2;

const ribbonAreaRatio = 0.20;
const totalAreaWidth = circleRadius * 3;
const sideAreaWidth = totalAreaWidth * ribbonAreaRatio;
const ribbonSpacing = sideAreaWidth / (ribbonPerSide - 1);
const ribbonWidthMin = 2;
const ribbonWidthMax = 14;

const ribbonLength = 40;
const segmentLength = (circleRadius * 2 * 1.35) / ribbonLength;

const gravity = 0.15 * vh;
const damping = 0.25;

const ribbons = [];
const globalPhase = Math.random() * Math.PI * 2;

function interpolateRootY(indexInSide, sideCount, topY, bottomY, ribbonPerSide) {
    // 保留中心右侧发束对齐顶部
    if (indexInSide > ribbonPerSide / 2) {
        return topY;
    }

    let t = 0;

    if (indexInSide < sideCount) {
        // 左侧插值
        t = (sideCount - 1 - indexInSide) / (sideCount - 1);
    } else if (indexInSide >= ribbonPerSide - sideCount) {
        // 右侧插值
        t = (indexInSide - (ribbonPerSide - sideCount)) / (sideCount - 1);
    } else {
        return topY; // 中间保持顶部
    }

    // 非线性插值
    t = Math.pow(t, 1.5);

    return topY * (1 - t) + bottomY * t;
}


for (let i = 0; i < ribbonCount; i++) {
    const ribbon = [];

    const isLeft = i < ribbonPerSide;
    const indexInSide = isLeft ? i : i - ribbonPerSide;

    const baseX = circle.x + (isLeft ? -1 : 1) * (
        circleRadius + sideAreaWidth / 2 - indexInSide * ribbonSpacing
    );

    const sideCount = ribbonPerSide / 2;
    const topY = circle.y - circle.head.radius;
    const bottomY = circle.y;

    const baseY = interpolateRootY(indexInSide, sideCount, topY, bottomY, ribbonPerSide);

    // 距离中心的归一化值（0~1）
    const centerIndex = (ribbonPerSide - 1) / 2;
    const distFromCenter = Math.abs(indexInSide - centerIndex) / centerIndex;

    // 发束长度插值（中心最长，边缘最短）
    const lengthRatio = 1 - distFromCenter * (1 - 0.35);
    const thisRibbonLength = Math.round(ribbonLength * lengthRatio);
    const thisSegmentLength = (circleRadius * 2 * 1.25 * lengthRatio) / thisRibbonLength;

    for (let j = 0; j < thisRibbonLength; j++) {
        const y = baseY + j * thisSegmentLength;
        ribbon.push({
            x: baseX,
            y: y,
            oldX: baseX,
            oldY: y
        });
    }

    ribbon.phase = globalPhase;
    ribbons.push(ribbon);
}


const labubuElem = document.querySelector('.labubu');

function updateCircleFromLabubu() {
    const rect = labubuElem.getBoundingClientRect();
    circle.x = rect.left + rect.width / 2;
    circle.y = rect.top + rect.height / 2;
}

function updateCircle(time) {
    updateCircleFromLabubu();

    headVelocity.x = circle.x - lastCircleX;
    headVelocity.y = circle.y - lastCircleY;
    lastCircleX = circle.x;
    lastCircleY = circle.y;
}

function updateRibbons(time) {
    const unit = Math.min(canvas.width, canvas.height) / 100;
    const windBase = 0.3 * unit + Math.sin(time * 0.0005) * 0.2 * unit;
    const windDirection = Math.sin(time * 0.0003);

    const topY = circle.y - circle.head.radius;
    const bottomY = circle.y - circle.head.radius * 0.3; // 提高底部插值目标

    for (let i = 0; i < ribbonCount; i++) {
        const ribbon = ribbons[i];
        const isLeft = i < ribbonPerSide;
        const indexInSide = isLeft ? i : i - ribbonPerSide;

        const baseX = circle.x + (isLeft ? -1 : 1) * (
            circleRadius + sideAreaWidth / 2 - indexInSide * ribbonSpacing
        );

        const sideCount = ribbonPerSide / 2;
        const baseY = interpolateRootY(indexInSide, sideCount, topY, bottomY, ribbonPerSide);

        // 发根追随头部位置
        //ribbon[0].x += (baseX - ribbon[0].x) * followSpeed + headVelocity.x * inertiaFactor;
        //ribbon[0].y += (baseY - ribbon[0].y) * followSpeed + headVelocity.y * inertiaFactor;
        ribbon[0].x = baseX;
        ribbon[0].y = baseY;



        ribbon[0].oldX = ribbon[0].x;
        ribbon[0].oldY = ribbon[0].y;

        // 局部风力
        const localWind = windBase * windDirection * Math.sin(time * 0.001 + ribbon.phase);

        // 更新每个段的物理位置
        for (let j = 1; j < ribbon.length; j++) {
            const point = ribbon[j];
            const vx = (point.x - point.oldX) * damping;
            const vy = (point.y - point.oldY) * damping;

            point.oldX = point.x;
            point.oldY = point.y;
            point.x += vx + localWind * 0.2;
            point.y += vy + gravity;
        }

        // 多次迭代保持段间距离
        for (let k = 0; k < 30; k++) {
            for (let j = 1; j < ribbon.length; j++) {
                const p1 = ribbon[j - 1];
                const p2 = ribbon[j];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const diff = segmentLength - dist;
                const percent = diff / dist / 2;
                const offsetX = dx * percent;
                const offsetY = dy * percent;

                if (j !== 1) {
                    p1.x -= offsetX;
                    p1.y -= offsetY;
                }
                p2.x += offsetX;
                p2.y += offsetY;
            }
        }
    }
}


function drawRibbons() {
    ctx.strokeStyle = ribbonColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let idx = 0; idx < ribbons.length; idx++) {
        const ribbon = ribbons[idx];
        if (ribbon.length < 4) continue;

        const indexInSide = idx % ribbonPerSide;

        // 插值宽度：外侧更粗
        const t = Math.pow(indexInSide / (ribbonPerSide - 1), 1.5);
        ctx.lineWidth = ribbonWidthMax * (1 - t) + ribbonWidthMin * t;

        const root = ribbon[0];

        ctx.beginPath();
        ctx.moveTo(root.x, root.y);

        for (let i = 0; i < ribbon.length - 3; i++) {
            const p1 = ribbon[i + 1];
            const p2 = ribbon[i + 2];
            const p3 = ribbon[i + 3];
            ctx.bezierCurveTo(p1.x, p1.y, p2.x, p2.y, p3.x, p3.y);
        }

        ctx.stroke();
    }
}


function animate(time) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    updateCircle(time);
    updateRibbons(time);

    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.head.radius, 0, Math.PI * 2);
    ctx.fillStyle = circle.head.color;
    ctx.fill();


    drawRibbons();

    requestAnimationFrame(animate);
}

requestAnimationFrame(animate);

window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
});