import { FileView, WorkspaceLeaf, TFile } from 'obsidian';
import JSZip from 'jszip';
import { MediaModal, VirtualMediaFile } from './modal/mediaModal';

export const VIEW_TYPE_ZIP = 'zip-image-viewer-view';

export class ZipView extends FileView {
	zip: JSZip | null = null;
	imageFiles: string[] = [];
	currentIndex: number = -1;
	loading = false;

	// Grid view 狀態與資源
	thumbnailUrls: Map<number, string> = new Map();
	observer: IntersectionObserver | null = null;

	// DOM Elements
	container!: HTMLDivElement;
	titleEl!: HTMLDivElement;
	loadingEl!: HTMLDivElement;
	gridContainer!: HTMLDivElement;
	gridEl!: HTMLDivElement;

	constructor(leaf: WorkspaceLeaf) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_ZIP;
	}

	getDisplayText(): string {
		return this.file ? this.file.name : "Zip Image Viewer";
	}

	getIcon(): string {
		return "folder-archive";
	}

	async onOpen() {
		const container = this.containerEl.children[1] as HTMLDivElement;
		container.empty();
		container.addClass('zip-viewer-container');
		container.addClass('is-grid-mode');
		container.setAttribute('tabindex', '0');

		// 建立頂部控制列
		const header = container.createDiv({ cls: 'zip-viewer-header' });
		this.titleEl = header.createDiv({ cls: 'zip-viewer-title' });

		// 主要區域
		const mainArea = container.createDiv({ cls: 'zip-viewer-main' });

		// 載入狀態
		this.loadingEl = mainArea.createDiv({ cls: 'zip-viewer-loading' });
		this.loadingEl.setText("Loading zip content...");

		// 網格檢視容器
		this.gridContainer = mainArea.createDiv({ cls: 'zip-viewer-grid-container' });
		this.gridEl = this.gridContainer.createDiv({ cls: 'zip-viewer-grid' });

		this.container = container;


		// 點擊容器自動聚焦
		this.registerDomEvent(container, 'click', () => {
			container.focus();
		});

		// 註冊鍵盤事件處理
		this.registerDomEvent(container, 'keydown', (event: KeyboardEvent) => {
			this.handleKeyDown(event);
		});
	}

	async onClose() {
		this.cleanupThumbnails();
	}

	cleanupThumbnails() {
		if (this.observer) {
			this.observer.disconnect();
			this.observer = null;
		}
		this.thumbnailUrls.forEach(url => {
			URL.revokeObjectURL(url);
		});
		this.thumbnailUrls.clear();
		if (this.gridEl) {
			this.gridEl.empty();
		}
	}

	async onLoadFile(file: TFile) {
		this.cleanupThumbnails();
		this.zip = null;
		this.imageFiles = [];
		this.currentIndex = -1;
		this.loading = true;

		if (this.loadingEl) this.loadingEl.addClass('active');
		if (this.titleEl) this.titleEl.setText("Reading zip...");

		try {
			const arrayBuffer = await this.app.vault.readBinary(file);
			const zip = await JSZip.loadAsync(arrayBuffer);
			this.zip = zip;

			const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.ico'];
			this.imageFiles = Object.keys(zip.files)
				.filter(filename => {
					const lower = filename.toLowerCase();
					return !zip.files[filename].dir &&
						imageExtensions.some(ext => lower.endsWith(ext)) &&
						!lower.includes('__macosx');
				})
				.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

			if (this.loadingEl) this.loadingEl.removeClass('active');

			if (this.imageFiles.length === 0) {
				if (this.titleEl) this.titleEl.setText("No images found in zip file");
				this.loading = false;
				return;
			}

			this.initGrid();

			this.currentIndex = 0;
			this.selectItem(0);
			this.loading = false;
			if (this.titleEl) {
				this.titleEl.setText(`${file.name} (${this.imageFiles.length} 張圖片)`);
			}

			// 自動聚焦，以利直接使用鍵盤
			if (this.container) {
				this.container.focus();
			}
		} catch (err) {
			console.error("Error reading zip file:", err);
			if (this.loadingEl) this.loadingEl.removeClass('active');
			if (this.titleEl) this.titleEl.setText("Error reading zip file");
			this.loading = false;
		}
	}

	initGrid() {
		if (!this.gridEl) return;
		this.gridEl.empty();

		this.setupLazyLoading();

		this.imageFiles.forEach((filename, index) => {
			const displayName = filename.split('/').pop() || filename;
			
			const item = this.gridEl.createDiv({ cls: 'zip-viewer-grid-item' });
			item.setAttribute('data-index', index.toString());
			item.setAttribute('data-file-path', filename);
			
			const imgWrapper = item.createDiv({ cls: 'zip-viewer-grid-item-img-wrapper' });
			const img = imgWrapper.createEl('img');
			
			const label = item.createDiv({ cls: 'zip-viewer-grid-item-label' });
			label.setText(displayName);

			item.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openMediaModal(index);
			});

			if (this.observer) {
				this.observer.observe(img);
			}
		});
	}

	setupLazyLoading() {
		if (this.observer) {
			this.observer.disconnect();
		}

		this.observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const img = entry.target as HTMLImageElement;
					const item = img.closest('.zip-viewer-grid-item');
					if (!item) return;
					
					const indexStr = item.getAttribute('data-index');
					if (indexStr === null) return;
					const index = parseInt(indexStr, 10);
					
					if (this.observer) {
						this.observer.unobserve(img);
					}

					if (this.thumbnailUrls.has(index)) {
						img.src = this.thumbnailUrls.get(index)!;
						img.addClass('lazy-loaded');
						return;
					}

					if (!this.zip) return;
					const filename = this.imageFiles[index];
					void (async () => {
						try {
							const fileObject = this.zip!.files[filename];
							const blob = await fileObject.async("blob");
							const url = URL.createObjectURL(blob);
							this.thumbnailUrls.set(index, url);
							
							img.src = url;
							img.addClass('lazy-loaded');
						} catch (err) {
							console.error(`Error loading thumbnail for index ${index}:`, err);
						}
					})();
				}
			});
		}, {
			root: this.gridContainer,
			rootMargin: '100px',
			threshold: 0.01
		});
	}

	openMediaModal(index: number) {
		if (!this.zip) return;

		// 建立虛擬 Media 檔案列表
		const virtualMediaFiles: VirtualMediaFile[] = this.imageFiles.map(filename => {
			return {
				name: filename.split('/').pop() || filename,
				path: filename,
				isVirtual: true,
				getBlobUrl: async () => {
					if (!this.zip) throw new Error("Zip is not loaded");
					const fileObject = this.zip.files[filename];
					const blob = await fileObject.async("blob");
					return URL.createObjectURL(blob);
				}
			};
		});

		const activeVirtualFile = virtualMediaFiles[index];

		// 為了相容 GridViewFocusTarget 的 interface
		const focusTarget = {
			gridItems: Array.from(this.gridEl.querySelectorAll<HTMLElement>('.zip-viewer-grid-item')),
			hasKeyboardFocus: true,
			selectItem: (idx: number) => {
				this.selectItem(idx);
				// 使 container 重新獲得鍵盤焦點
				if (this.container) {
					this.container.focus();
				}
			}
		};

		const modal = new MediaModal(this.app, activeVirtualFile, virtualMediaFiles, focusTarget);
		modal.open();
	}

	selectItem(idx: number) {
		if (idx < 0 || idx >= this.imageFiles.length) return;
		this.currentIndex = idx;
		const items = this.gridEl.querySelectorAll('.zip-viewer-grid-item');
		items.forEach((item, index) => {
			if (index === idx) {
				item.addClass('current');
				item.scrollIntoView({ block: 'center', behavior: 'smooth' });
			} else {
				item.removeClass('current');
			}
		});
	}

	handleKeyDown(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target && (
			target.isContentEditable ||
			target.closest('input, textarea, select, [contenteditable="true"]')
		)) {
			return;
		}

		if (this.imageFiles.length === 0 || this.loading) return;

		// 如果有 Modal 視窗，則不處理（讓 Modal 自己處理）
		if (activeDocument.querySelector('.modal-container')) return;

		let newIndex = this.currentIndex;

		// 如果還沒有選中項目（currentIndex === -1）且按下了方向鍵，選中第一個項目
		if (this.currentIndex === -1 &&
			['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
			this.selectItem(0);
			event.preventDefault();
			return;
		}

		const gridItems = Array.from(this.gridEl.querySelectorAll<HTMLElement>('.zip-viewer-grid-item'));

		switch (event.key) {
			case 'ArrowRight':
				newIndex = Math.min(this.imageFiles.length - 1, this.currentIndex + 1);
				event.preventDefault();
				break;
			case 'ArrowLeft':
				newIndex = Math.max(0, this.currentIndex - 1);
				event.preventDefault();
				break;
			case 'ArrowDown':
				if (this.currentIndex >= 0 && gridItems.length > 0) {
					const currentItem = gridItems[this.currentIndex];
					const currentRect = currentItem.getBoundingClientRect();
					const currentCenterX = currentRect.left + currentRect.width / 2;
					const currentBottom = currentRect.bottom;

					let closestItem = -1;
					let minDistance = Number.MAX_VALUE;
					let minVerticalDistance = Number.MAX_VALUE;

					for (let i = 0; i < gridItems.length; i++) {
						if (i === this.currentIndex) continue;

						const itemRect = gridItems[i].getBoundingClientRect();
						const itemCenterX = itemRect.left + itemRect.width / 2;
						const itemTop = itemRect.top;

						if (itemTop <= currentBottom) continue;

						const horizontalDistance = Math.abs(itemCenterX - currentCenterX);
						const verticalDistance = itemTop - currentBottom;

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
						newIndex = gridItems.length - 1;
					}
				} else {
					newIndex = 0;
				}
				event.preventDefault();
				break;
			case 'ArrowUp':
				if (this.currentIndex >= 0 && gridItems.length > 0) {
					const currentItem = gridItems[this.currentIndex];
					const currentRect = currentItem.getBoundingClientRect();
					const currentCenterX = currentRect.left + currentRect.width / 2;
					const currentTop = currentRect.top;

					let closestItem = -1;
					let minDistance = Number.MAX_VALUE;
					let minVerticalDistance = Number.MAX_VALUE;

					for (let i = 0; i < gridItems.length; i++) {
						if (i === this.currentIndex) continue;

						const itemRect = gridItems[i].getBoundingClientRect();
						const itemCenterX = itemRect.left + itemRect.width / 2;
						const itemBottom = itemRect.bottom;

						if (itemBottom >= currentTop) continue;

						const horizontalDistance = Math.abs(itemCenterX - currentCenterX);
						const verticalDistance = currentTop - itemBottom;

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
						newIndex = 0;
					}
				} else {
					newIndex = 0;
				}
				event.preventDefault();
				break;
			case 'Home':
				newIndex = 0;
				event.preventDefault();
				break;
			case 'End':
				newIndex = this.imageFiles.length - 1;
				event.preventDefault();
				break;
			case 'Enter':
				if (this.currentIndex >= 0 && this.currentIndex < this.imageFiles.length) {
					this.openMediaModal(this.currentIndex);
				}
				event.preventDefault();
				break;
		}

		if (newIndex !== this.currentIndex) {
			this.selectItem(newIndex);
		}
	}
}
