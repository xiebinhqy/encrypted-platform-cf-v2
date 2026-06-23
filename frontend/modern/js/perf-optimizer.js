/**
 * 前端性能优化模块
 * 
 * 功能：
 * 1. 虚拟滚动 - 大量笔记时仅渲染可见区域
 * 2. 乐观更新 - 创建/编辑成功后立即更新 UI
 * 3. 局部刷新 - 只更新受影响的 DOM 元素
 * 4. 骨架屏加载动画
 */

// ====================== 虚拟滚动 ======================
export class VirtualScroller {
  constructor(container, options = {}) {
    this.container = container;
    this.itemHeight = options.itemHeight || 72;  // 每项高度(px)
    this.bufferSize = options.bufferSize || 5;   // 上下缓冲区项数
    this.items = [];
    this.renderItem = options.renderItem || (() => '');
    this.onEndReached = options.onEndReached || null;
    this.threshold = options.threshold || 200;   // 触底阈值(px)
    
    this._viewport = null;
    this._phantom = null;
    this._content = null;
    this._renderedRange = { start: 0, end: 0 };
    this._scrollTop = 0;
    this._enabled = false;
    
    this._init();
  }

  _init() {
    // 创建视口容器
    this._viewport = document.createElement('div');
    this._viewport.className = 'virtual-scroll-viewport';
    this._viewport.style.cssText = 'overflow-y:auto;position:relative;width:100%;height:100%;';
    
    // 占位元素（撑开滚动条）
    this._phantom = document.createElement('div');
    this._phantom.className = 'virtual-scroll-phantom';
    this._phantom.style.cssText = 'position:absolute;left:0;top:0;width:1px;pointer-events:none;';
    
    // 实际渲染内容容器
    this._content = document.createElement('div');
    this._content.className = 'virtual-scroll-content';
    this._content.style.cssText = 'position:relative;width:100%;';
    
    this._viewport.appendChild(this._phantom);
    this._viewport.appendChild(this._content);
    
    // 滚动事件监听（使用 passive 提升性能）
    this._scrollHandler = this._onScroll.bind(this);
    this._viewport.addEventListener('scroll', this._scrollHandler, { passive: true });
  }

  /**
   * 设置数据并渲染
   */
  setItems(items) {
    this.items = items || [];
    // 设置占位高度
    this._phantom.style.height = (this.items.length * this.itemHeight) + 'px';
    this._render();
  }

  /**
   * 滚动到顶部
   */
  scrollToTop() {
    if (this._viewport) this._viewport.scrollTop = 0;
  }

  /**
   * 追加数据（分页加载）
   */
  appendItems(newItems) {
    this.items = this.items.concat(newItems || []);
    this._phantom.style.height = (this.items.length * this.itemHeight) + 'px';
    this._render();
  }

  /**
   * 启用虚拟滚动（笔记数量超过阈值时）
   */
  enable() {
    this._enabled = true;
    return this;
  }

  /**
   * 判断是否需要启用
   */
  static shouldEnable(itemCount, threshold = 100) {
    return itemCount > threshold;
  }

  _onScroll() {
    this._scrollTop = this._viewport.scrollTop;
    this._render();
    
    // 触底检测
    if (this.onEndReached) {
      const scrollHeight = this._phantom.offsetHeight;
      if (this._scrollTop + this._viewport.clientHeight + this.threshold >= scrollHeight) {
        this.onEndReached();
      }
    }
  }

  _render() {
    if (!this._enabled || this.items.length === 0) {
      // 不启用虚拟滚动时，直接渲染全部
      this._content.innerHTML = this.items.map((item, i) => this.renderItem(item, i)).join('');
      return;
    }

    const scrollTop = this._scrollTop;
    const viewportHeight = this._viewport.clientHeight || 600;
    
    // 计算可见范围
    let start = Math.floor(scrollTop / this.itemHeight) - this.bufferSize;
    start = Math.max(0, start);
    
    let end = Math.ceil((scrollTop + viewportHeight) / this.itemHeight) + this.bufferSize;
    end = Math.min(this.items.length, end);
    
    // 范围未变化则跳过渲染
    if (start === this._renderedRange.start && end === this._renderedRange.end) return;
    this._renderedRange = { start, end };
    
    // 使用 DocumentFragment 高效渲染
    const fragment = document.createDocumentFragment();
    for (let i = start; i < end; i++) {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = this.renderItem(this.items[i], i);
      // 取第一个子节点
      if (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);
    }
    
    this._content.style.transform = `translateY(${start * this.itemHeight}px)`;
    this._content.innerHTML = '';
    this._content.appendChild(fragment);
  }

  /**
   * 销毁
   */
  destroy() {
    if (this._viewport) {
      this._viewport.removeEventListener('scroll', this._scrollHandler);
    }
  }

  /**
   * 挂载到 DOM
   */
  mount(targetElement) {
    if (targetElement && this._viewport) {
      targetElement.innerHTML = '';
      targetElement.appendChild(this._viewport);
    }
  }
}

// ====================== 乐观更新管理器 ======================
export class OptimisticUpdater {
  constructor() {
    this._pendingOps = new Map(); // id -> { type, data, timestamp }
  }

  /**
   * 记录待提交操作
   */
  recordPending(id, type, data) {
    this._pendingOps.set(id, { type, data, timestamp: Date.now() });
  }

  /**
   * 移除待提交操作
   */
  clearPending(id) {
    this._pendingOps.delete(id);
  }

  /**
   * 获取所有待提交操作
   */
  getPending() {
    return this._pendingOps;
  }

  /**
   * 检查是否有待提交操作
   */
  hasPending(id) {
    return this._pendingOps.has(id);
  }
}

// ====================== 局部刷新管理器 ======================
export class PartialRefresher {
  /**
   * 高效地在列表中插入一个新笔记项（不重新渲染整个列表）
   * @param {string} listSelector - 列表容器选择器
   * @param {string} itemHtml - 新笔记项的 HTML
   * @param {string} position - 'top' 插入到顶部, 'bottom' 插入到底部
   */
  static insertNote(listSelector, itemHtml, position = 'top') {
    const list = document.querySelector(listSelector);
    if (!list) return false;

    const temp = document.createElement('div');
    temp.innerHTML = itemHtml;
    const newNode = temp.firstElementChild;
    if (!newNode) return false;

    // 添加进入动画
    newNode.style.opacity = '0';
    newNode.style.transform = 'translateY(-10px)';
    newNode.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

    if (position === 'top' && list.firstChild) {
      list.insertBefore(newNode, list.firstChild);
    } else {
      list.appendChild(newNode);
    }

    // 触发动画
    requestAnimationFrame(() => {
      newNode.style.opacity = '1';
      newNode.style.transform = 'translateY(0)';
    });

    return true;
  }

  /**
   * 从列表中移除一个笔记项（带动画）
   * @param {string} noteId - 笔记 ID
   * @returns {Promise<boolean>} 是否成功移除
   */
  static async removeNote(noteId) {
    const noteItem = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!noteItem) return false;

    // 退出动画
    noteItem.style.transition = 'opacity 0.25s ease, transform 0.25s ease';
    noteItem.style.opacity = '0';
    noteItem.style.transform = 'translateX(20px)';

    return new Promise(resolve => {
      setTimeout(() => {
        noteItem.remove();
        resolve(true);
      }, 250);
    });
  }

  /**
   * 更新列表中某个笔记项的内容
   * @param {string} noteId - 笔记 ID
   * @param {string} newHtml - 新的内容 HTML
   * @returns {boolean} 是否成功更新
   */
  static updateNote(noteId, newHtml) {
    const noteItem = document.querySelector(`[data-note-id="${noteId}"]`);
    if (!noteItem) return false;

    // 闪烁高亮效果
    noteItem.style.transition = 'background-color 0.3s ease';
    noteItem.style.backgroundColor = 'rgba(99, 102, 241, 0.05)';
    setTimeout(() => {
      noteItem.style.backgroundColor = '';
    }, 600);

    const temp = document.createElement('div');
    temp.innerHTML = newHtml;
    const newNode = temp.firstElementChild;
    if (!newNode) return false;

    // 保留事件处理器，只更新内容
    noteItem.innerHTML = newNode.innerHTML;
    return true;
  }

  /**
   * 高效地更新统计数字（只更新数字，不动其他 DOM）
   */
  static updateStatNumber(elementId, newValue) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    const oldValue = el.textContent;
    if (oldValue === String(newValue)) return; // 值未变化，跳过
    
    el.textContent = newValue;
    // 数字变化动画
    el.style.transition = 'transform 0.2s ease';
    el.style.transform = 'scale(1.2)';
    setTimeout(() => {
      el.style.transform = 'scale(1)';
    }, 200);
  }
}

// ====================== 骨架屏加载动画 ======================
export class SkeletonLoader {
  /**
   * 笔记列表骨架屏
   * @param {number} count - 骨架项数量
   * @returns {string} HTML 字符串
   */
  static noteListSkeleton(count = 6) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="note-item skeleton-item" style="pointer-events:none;animation-delay:${i * 0.05}s">
          <div class="note-item-main">
            <div class="note-icon skeleton-pulse" style="width:40px;height:40px;border-radius:8px;background:var(--bg-tertiary,#e5e7eb);flex-shrink:0;"></div>
            <div style="flex:1;min-width:0;">
              <div class="skeleton-pulse" style="height:14px;width:${60 + Math.random() * 30}%;border-radius:4px;background:var(--bg-tertiary,#e5e7eb);margin-bottom:8px;"></div>
              <div class="skeleton-pulse" style="height:11px;width:${40 + Math.random() * 20}%;border-radius:4px;background:var(--bg-tertiary,#e5e7eb);margin-bottom:6px;"></div>
              <div class="skeleton-pulse" style="height:10px;width:${30 + Math.random() * 15}%;border-radius:4px;background:var(--bg-tertiary,#e5e7eb);"></div>
            </div>
            <div class="skeleton-pulse" style="width:60px;height:24px;border-radius:12px;background:var(--bg-tertiary,#e5e7eb);flex-shrink:0;"></div>
          </div>
        </div>`;
    }
    return html;
  }

  /**
   * 注入骨架屏样式
   */
  static injectStyles() {
    if (document.getElementById('skeleton-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'skeleton-styles';
    style.textContent = `
      @keyframes skeleton-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .skeleton-item {
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
      .skeleton-pulse {
        animation: skeleton-pulse 1.5s ease-in-out infinite;
      }
    `;
    document.head.appendChild(style);
  }
}

// ====================== 性能监控 ======================
export class PerfMonitor {
  static _marks = {};

  static mark(name) {
    this._marks[name] = performance.now();
  }

  static measure(name, startMark) {
    const start = this._marks[startMark];
    if (start === undefined) return null;
    const duration = performance.now() - start;
    console.log(`⏱ [Perf] ${name}: ${duration.toFixed(1)}ms`);
    delete this._marks[startMark];
    return duration;
  }
}