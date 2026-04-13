const container = document.getElementById('puzzle-container');
let tiles = [1, 2, 3, 4, 5, 6, 7, 8, ""]; 

function render() {
    container.innerHTML = "";
    tiles.forEach((tile, index) => {
        const tileDiv = document.createElement('div');
        tileDiv.classList.add('tile');
        if (tile === "") tileDiv.classList.add('empty');
        tileDiv.innerText = tile;
        tileDiv.addEventListener('click', () => moveTile(index));
        container.appendChild(tileDiv);
    });
}

function moveTile(index) {
    const emptyIndex = tiles.indexOf("");
    const adjacentIndices = [index - 1, index + 1, index - 3, index + 3];

        if (adjacentIndices.includes(emptyIndex)) {
              [tiles[index], tiles[emptyIndex]] = [tiles[emptyIndex], tiles[index]];
        render();
        checkWin();
    }
}

function shuffle() {
    tiles.sort(() => Math.random() - 0.5);
    render();
}

function checkWin() {
    const winningCombo = [1, 2, 3, 4, 5, 6, 7, 8, ""];
    if (JSON.stringify(tiles) === JSON.stringify(winningCombo)) {
        setTimeout(() => alert("Félicitations ! Tu as gagné !"), 100);
    }
}

render();