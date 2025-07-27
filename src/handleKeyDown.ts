import type { GridView } from "./GridView";

export function handleKeyDown(gridView: GridView, event: KeyboardEvent) {
    // 如果沒有項目或正在檢視筆記，直接返回
    if (gridView.gridItems.length === 0 || gridView.isShowingNote) return;

    // 如果有Modal視窗，直接返回
    if (document.querySelector('.modal-container')) return;
    
    let newIndex = gridView.selectedItemIndex;

    // 如果還沒有選中項目且按下了方向鍵，選中第一個項目
    if (gridView.selectedItemIndex === -1 && 
        ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        gridView.hasKeyboardFocus = true;
        gridView.selectItem(0);
        event.preventDefault();
        return;
    }

    switch (event.key) {
        case 'ArrowRight':
            if (event.altKey) {
                // 如果有選中的項目，模擬點擊
                if (gridView.selectedItemIndex >= 0 && gridView.selectedItemIndex < gridView.gridItems.length) {
                    gridView.gridItems[gridView.selectedItemIndex].click();
                }
            }  
            newIndex = Math.min(gridView.gridItems.length - 1, gridView.selectedItemIndex + 1);
            gridView.hasKeyboardFocus = true;
            event.preventDefault();
            break;
        case 'ArrowLeft':
            if (event.altKey) {
                // 如果按下 Alt + 左鍵，且是資料夾模式且不是根目錄
                if (gridView.sourceMode === 'folder' && gridView.sourcePath && gridView.sourcePath !== '/') {
                    // 獲取上一層資料夾路徑
                    const parentPath = gridView.sourcePath.split('/').slice(0, -1).join('/') || '/';
                    gridView.setSource('folder', parentPath, true);
                    gridView.clearSelection();
                    event.preventDefault();
                }
                break;
            }
            newIndex = Math.max(0, gridView.selectedItemIndex - 1);
            gridView.hasKeyboardFocus = true;
            event.preventDefault();
            break;
        case 'ArrowDown':
            // 使用基於位置的導航而非固定行數
            if (gridView.selectedItemIndex >= 0) {
                const currentItem = gridView.gridItems[gridView.selectedItemIndex];
                const currentRect = currentItem.getBoundingClientRect();
                const currentCenterX = currentRect.left + currentRect.width / 2;
                const currentBottom = currentRect.bottom;
                
                // 尋找下方最近的項目
                let closestItem = -1;
                let minDistance = Number.MAX_VALUE;
                let minVerticalDistance = Number.MAX_VALUE;
                
                for (let i = 0; i < gridView.gridItems.length; i++) {
                    if (i === gridView.selectedItemIndex) continue;
                    
                    const itemRect = gridView.gridItems[i].getBoundingClientRect();
                    const itemCenterX = itemRect.left + itemRect.width / 2;
                    const itemTop = itemRect.top;
                    
                    // 只考慮下方的項目
                    if (itemTop <= currentBottom) continue;
                    
                    // 計算水平和垂直距離
                    const horizontalDistance = Math.abs(itemCenterX - currentCenterX);
                    const verticalDistance = itemTop - currentBottom;
                    
                    // 優先考慮垂直距離最小的項目
                    if (verticalDistance < minVerticalDistance || 
                        (verticalDistance === minVerticalDistance && horizontalDistance < minDistance)) {
                        minVerticalDistance = verticalDistance;
                        minDistance = horizontalDistance;
                        closestItem = i;
                    }
                }
                
                if (closestItem !== -1) {
                    newIndex = closestItem;
                } else {
                    // 如果找不到下方項目，選擇最後一個項目
                    newIndex = gridView.gridItems.length - 1;
                }
            } else {
                newIndex = 0; // 如果沒有選中項目，選擇第一個
            }
            gridView.hasKeyboardFocus = true;
            event.preventDefault();
            break;
        case 'ArrowUp':
            if (event.altKey) {
                // 如果按下 Alt + 上鍵，且是資料夾模式且不是根目錄
                if (gridView.sourceMode === 'folder' && gridView.sourcePath && gridView.sourcePath !== '/') {
                    // 獲取上一層資料夾路徑
                    const parentPath = gridView.sourcePath.split('/').slice(0, -1).join('/') || '/';
                    gridView.setSource('folder', parentPath, true);
                    gridView.clearSelection();
                    event.preventDefault();
                }
                break;
            }
            // 使用基於位置的導航而非固定行數
            if (gridView.selectedItemIndex >= 0) {
                const currentItem = gridView.gridItems[gridView.selectedItemIndex];
                const currentRect = currentItem.getBoundingClientRect();
                const currentCenterX = currentRect.left + currentRect.width / 2;
                const currentTop = currentRect.top;
                
                // 尋找上方最近的項目
                let closestItem = -1;
                let minDistance = Number.MAX_VALUE;
                let minVerticalDistance = Number.MAX_VALUE;
                
                for (let i = 0; i < gridView.gridItems.length; i++) {
                    if (i === gridView.selectedItemIndex) continue;
                    
                    const itemRect = gridView.gridItems[i].getBoundingClientRect();
                    const itemCenterX = itemRect.left + itemRect.width / 2;
                    const itemBottom = itemRect.bottom;
                    
                    // 只考慮上方的項目
                    if (itemBottom >= currentTop) continue;
                    
                    // 計算水平和垂直距離
                    const horizontalDistance = Math.abs(itemCenterX - currentCenterX);
                    const verticalDistance = currentTop - itemBottom;
                    
                    // 優先考慮垂直距離最小的項目
                    if (verticalDistance < minVerticalDistance || 
                        (verticalDistance === minVerticalDistance && horizontalDistance < minDistance)) {
                        minVerticalDistance = verticalDistance;
                        minDistance = horizontalDistance;
                        closestItem = i;
                    }
                }
                
                if (closestItem !== -1) {
                    newIndex = closestItem;
                } else {
                    // 如果找不到上方項目，選擇第一個項目
                    newIndex = 0;
                }
            } else {
                newIndex = 0; // 如果沒有選中項目，選擇第一個
            }
            gridView.hasKeyboardFocus = true;
            event.preventDefault();
            break;
        case 'Home':
            newIndex = 0;
            gridView.hasKeyboardFocus = true;
            event.preventDefault();
            break;
        case 'End':
            newIndex = gridView.gridItems.length - 1;
            gridView.hasKeyboardFocus = true;
            event.preventDefault();
            break;
        case 'Enter':
            // 如果有選中的項目，模擬點擊
            if (gridView.selectedItemIndex >= 0 && gridView.selectedItemIndex < gridView.gridItems.length) {
                gridView.gridItems[gridView.selectedItemIndex].click();
            }
            gridView.clearSelection();
            event.preventDefault();
            break;
        case 'Backspace':
            // 如果是資料夾模式且不是根目錄，返回上一層資料夾
            if (gridView.sourceMode === 'folder' && gridView.sourcePath && gridView.sourcePath !== '/') {
                // 獲取上一層資料夾路徑
                const parentPath = gridView.sourcePath.split('/').slice(0, -1).join('/') || '/';
                gridView.setSource('folder', parentPath, true);
                gridView.clearSelection();
                event.preventDefault();
            }
            break;
        case 'Escape':
            // 清除選中狀態
            if (gridView.selectedItemIndex >= 0) {
                gridView.hasKeyboardFocus = false;
                gridView.clearSelection();
                event.preventDefault();
            }
            break;
    }

    // 如果索引有變化，選中新項目
    if (newIndex !== gridView.selectedItemIndex) {
        gridView.selectItem(newIndex);
    }
}
