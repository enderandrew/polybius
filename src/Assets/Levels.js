const levels = (function generateLevels() {
  const arr = [];
  let currentScore = 0;
  let lastCheckpointScore = 0;

  for (let i = 1; i <= 256; i++) {
    // Checkpoint (Selectable) Spacing Logic
    let selectable = false;
    if (i === 1) selectable = true;
    else if (i <= 16) selectable = (i % 2 !== 0);       // Every 2nd level (3, 5, 7...)
    else if (i <= 32) selectable = (i % 3 === 2);       // Every 3rd level (17, 20, 23...)
    else if (i <= 64) selectable = (i % 4 === 1);       // Every 4th level (33, 37...)
    else if (i <= 128) selectable = (i % 8 === 1);      // Every 8th level (65, 73...)
    else selectable = (i % 16 === 1);                   // Every 16th level for the deep endgame

    // Score Target Scaling Curve
    // Base step starts at 3000 and slowly increases, capping out at +18,000 pts per level
    let step = 3000 + Math.min(i * 300, 15000); 
    
    currentScore += step;
    
    // Round cleanly to the nearest 100
    let targetScore = Math.floor(currentScore / 100) * 100;

    if (selectable) {
       // Save the score requirement of this checkpoint to assign to future non-selectable levels
       lastCheckpointScore = targetScore - step; 
    }

    let scoreBonus = selectable ? lastCheckpointScore : 0;
    
    // Hardcode level 1 overrides to start cleanly at 0
    if (i === 1) { 
        targetScore = 3000; 
        scoreBonus = 0; 
    }

    arr.push({
      id: i,
      selectable: selectable,
      scoreBonus: scoreBonus,
      targetScore: targetScore
    });
  }
  
  return arr;
})();

export default levels;