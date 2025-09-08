
document.getElementById("about-button").addEventListener("click", () => {
    window.open("https://aj300542.github.io/", "_blank");
});

const buttonMap = {
    index2: "index2.html",
    index3: "index3.html",
    index4: "index4.html",
    index5: "index5.html",
    index6: "index6.html",
    index7: "index7.html",
    index8: "index8.html",
    index9: "index9.html",
    index10: "index10.html",
    indexA_01: "indexA_01.html",
    indexB: "indexB.html",
    indexC: "indexC.html",
    indexD: "indexD.html",
    indexE: "indexE.html",
    indexF: "indexF.html",
    indexG: "indexG.html",
    indexH: "indexH.html",
    indexI: "indexI.html",
    indexL: "indexL.html",
    indexM: "indexM.html",
    indexN: "indexN.html",
    indexN: "indexO.html",
    indexP: "indexP.html",
    indexQ: "indexQ.html",
    indexR: "indexR.html",
};

Object.entries(buttonMap).forEach(([id, url]) => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener("click", () => {
            window.location.href = url;
        });
    }
});


