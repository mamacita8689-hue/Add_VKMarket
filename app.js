const form = document.querySelector('#productForm');
const photoInput = document.querySelector('#photoInput');
const dropzone = document.querySelector('#dropzone');
const photoGrid = document.querySelector('#photoGrid');
const titleInput = document.querySelector('#title');
const descriptionInput = document.querySelector('#description');
const priceInput = document.querySelector('#price');
const skuInput = document.querySelector('#sku');
const quantityInput = document.querySelector('#quantity');
const productTypeInput = document.querySelector('#productType');
const vkCategoryInput = document.querySelector('#vkCategory');
const albumInput = document.querySelector('#album');
const activeInput = document.querySelector('#active');
const draftStatus = document.querySelector('#draftStatus');
const saveDraftButton = document.querySelector('#saveDraftButton');
const clearButton = document.querySelector('#clearButton');
const toast = document.querySelector('#toast');

const previewImage = document.querySelector('#previewImage');
const previewTitle = document.querySelector('#previewTitle');
const previewPrice = document.querySelector('#previewPrice');
const previewDescription = document.querySelector('#previewDescription');
const previewType = document.querySelector('#previewType');
const previewStock = document.querySelector('#previewStock');

const settingsDialog = document.querySelector('#settingsDialog');
const settingsButton = document.querySelector('#settingsButton');
const saveSettingsButton = document.querySelector('#saveSettingsButton');
const groupIdInput = document.querySelector('#groupId');
const apiUrlInput = document.querySelector('#apiUrl');

const DRAFT_KEY = 'vk-market-product-draft-v1';
const SETTINGS_KEY = 'vk-market-settings-v1';
const MAX_PHOTOS = 5;
const MAX_LOCAL_PHOTO_BYTES = 2_000_000;

let photos = [];
let toastTimer;

function showToast(message, type = 'normal') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('is-error', type === 'error');
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return '0 ₽';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(price)} ₽`;
}

function updateCounters() {
  document.querySelector('#titleCount').textContent = `${titleInput.value.length} / 120`;
  document.querySelector('#descriptionCount').textContent = `${descriptionInput.value.length} / 4000`;
}

function updatePreview() {
  previewTitle.textContent = titleInput.value.trim() || 'Название товара';
  previewPrice.textContent = formatPrice(priceInput.value);
  previewDescription.textContent = descriptionInput.value.trim() || 'Здесь появится краткое описание товара.';
  previewType.textContent = productTypeInput.value || 'Товар';

  const quantity = quantityInput.value.trim();
  previewStock.textContent = quantity === '' ? 'Остаток не указан' : `В наличии: ${quantity} шт.`;

  if (photos[0]?.dataUrl) {
    previewImage.src = photos[0].dataUrl;
    previewImage.hidden = false;
    document.querySelector('.vk-card__placeholder').hidden = true;
  } else {
    previewImage.removeAttribute('src');
    previewImage.hidden = true;
    document.querySelector('.vk-card__placeholder').hidden = false;
  }

  updateCounters();
}

function renderPhotos() {
  photoGrid.replaceChildren();

  photos.forEach((photo, index) => {
    const item = document.createElement('div');
    item.className = 'photo-item';

    const image = document.createElement('img');
    image.src = photo.dataUrl;
    image.alt = `Фото товара ${index + 1}`;

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'photo-item__remove';
    removeButton.setAttribute('aria-label', `Удалить фото ${index + 1}`);
    removeButton.textContent = '×';
    removeButton.addEventListener('click', () => {
      photos.splice(index, 1);
      renderPhotos();
      updatePreview();
      markChanged();
    });

    item.append(image, removeButton);

    if (index === 0) {
      const badge = document.createElement('span');
      badge.className = 'photo-item__main';
      badge.textContent = 'Главное';
      item.append(badge);
    }

    photoGrid.append(item);
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function addPhotos(fileList) {
  const candidates = Array.from(fileList).filter(file => file.type.startsWith('image/'));
  const remaining = MAX_PHOTOS - photos.length;

  if (remaining <= 0) {
    showToast(`Можно добавить не больше ${MAX_PHOTOS} фотографий`, 'error');
    return;
  }

  const selected = candidates.slice(0, remaining);
  if (candidates.length > remaining) {
    showToast(`Добавлены первые ${remaining} фото. Лимит — ${MAX_PHOTOS}.`);
  }

  for (const file of selected) {
    if (file.size > 12_000_000) {
      showToast(`Файл «${file.name}» слишком большой`, 'error');
      continue;
    }

    const dataUrl = await fileToDataUrl(file);
    photos.push({
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl,
      persistable: file.size <= MAX_LOCAL_PHOTO_BYTES,
    });
  }

  photoInput.value = '';
  renderPhotos();
  updatePreview();
  markChanged();
}

photoInput.addEventListener('change', event => addPhotos(event.target.files));

['dragenter', 'dragover'].forEach(type => {
  dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.add('is-dragging');
  });
});

['dragleave', 'drop'].forEach(type => {
  dropzone.addEventListener(type, event => {
    event.preventDefault();
    dropzone.classList.remove('is-dragging');
  });
});

dropzone.addEventListener('drop', event => addPhotos(event.dataTransfer.files));

function getFormData() {
  return {
    title: titleInput.value.trim(),
    description: descriptionInput.value.trim(),
    price: priceInput.value,
    sku: skuInput.value.trim(),
    quantity: quantityInput.value,
    productType: productTypeInput.value,
    vkCategory: vkCategoryInput.value,
    album: albumInput.value,
    active: activeInput.checked,
  };
}

function setFormData(data = {}) {
  titleInput.value = data.title ?? '';
  descriptionInput.value = data.description ?? '';
  priceInput.value = data.price ?? '';
  skuInput.value = data.sku ?? '';
  quantityInput.value = data.quantity ?? '';
  productTypeInput.value = data.productType ?? 'Кабошоны';
  vkCategoryInput.value = data.vkCategory ?? '';
  albumInput.value = data.album ?? '';
  activeInput.checked = data.active ?? true;
  updatePreview();
}

function markChanged() {
  draftStatus.textContent = 'Есть несохранённые изменения';
}

function saveDraft() {
  const draftPhotos = photos
    .filter(photo => photo.persistable)
    .map(({ name, type, size, dataUrl, persistable }) => ({ name, type, size, dataUrl, persistable }));

  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({
      data: getFormData(),
      photos: draftPhotos,
      savedAt: new Date().toISOString(),
    }));
    draftStatus.textContent = 'Черновик сохранён';
    showToast(photos.some(photo => !photo.persistable)
      ? 'Черновик сохранён. Крупные фото нужно будет выбрать заново.'
      : 'Черновик сохранён');
  } catch {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: getFormData(), photos: [], savedAt: new Date().toISOString() }));
    draftStatus.textContent = 'Черновик сохранён без фото';
    showToast('Текст сохранён. Фото слишком большие для хранения в браузере.');
  }
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!saved) return;
    setFormData(saved.data);
    photos = Array.isArray(saved.photos) ? saved.photos : [];
    renderPhotos();
    updatePreview();
    draftStatus.textContent = 'Черновик восстановлен';
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function clearForm() {
  form.reset();
  photos = [];
  localStorage.removeItem(DRAFT_KEY);
  renderPhotos();
  setFormData({});
  clearValidation();
  draftStatus.textContent = 'Новый черновик';
  showToast('Форма очищена');
}

function clearValidation() {
  [titleInput, descriptionInput, priceInput].forEach(input => input.classList.remove('is-invalid'));
  document.querySelector('#titleError').textContent = '';
  document.querySelector('#descriptionError').textContent = '';
  document.querySelector('#priceError').textContent = '';
}

function validateForm() {
  clearValidation();
  let valid = true;

  if (!titleInput.value.trim()) {
    titleInput.classList.add('is-invalid');
    document.querySelector('#titleError').textContent = 'Укажите название';
    valid = false;
  }

  if (!descriptionInput.value.trim()) {
    descriptionInput.classList.add('is-invalid');
    document.querySelector('#descriptionError').textContent = 'Добавьте описание';
    valid = false;
  }

  if (!priceInput.value || Number(priceInput.value) <= 0) {
    priceInput.classList.add('is-invalid');
    document.querySelector('#priceError').textContent = 'Укажите цену больше 0';
    valid = false;
  }

  if (!valid) {
    document.querySelector('.is-invalid')?.focus();
    showToast('Проверьте обязательные поля', 'error');
  }

  return valid;
}

function getSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify({
    groupId: groupIdInput.value.trim(),
    apiUrl: apiUrlInput.value.trim().replace(/\/$/, ''),
  }));
  showToast('Настройки сохранены');
}

function openSettings() {
  const settings = getSettings();
  groupIdInput.value = settings.groupId || '';
  apiUrlInput.value = settings.apiUrl || '';
  settingsDialog.showModal();
}

async function publishProduct() {
  if (!validateForm()) return;

  const settings = getSettings();
  if (!settings.apiUrl || !settings.groupId) {
    saveDraft();
    showToast('Сначала укажите сообщество и подключите серверный API', 'error');
    openSettings();
    return;
  }

  const payload = new FormData();
  payload.append('groupId', settings.groupId);
  payload.append('product', JSON.stringify(getFormData()));

  // Сохранённые после перезагрузки dataURL не являются File, поэтому
  // реальная публикация требует заново выбранных файлов или серверного черновика.
  // На первом этапе серверный endpoint может принимать JSON без фото для тестирования.

  const publishButton = form.querySelector('[type="submit"]');
  const originalText = publishButton.textContent;
  publishButton.disabled = true;
  publishButton.textContent = 'Публикация…';

  try {
    const response = await fetch(`${settings.apiUrl}/api/products`, {
      method: 'POST',
      body: payload,
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Ошибка ${response.status}`);

    localStorage.removeItem(DRAFT_KEY);
    draftStatus.textContent = 'Опубликовано';
    showToast('Товар успешно отправлен в VK');
  } catch (error) {
    saveDraft();
    showToast(`Не удалось опубликовать: ${error.message}`, 'error');
  } finally {
    publishButton.disabled = false;
    publishButton.textContent = originalText;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  publishProduct();
});

saveDraftButton.addEventListener('click', saveDraft);
clearButton.addEventListener('click', () => {
  if (confirm('Очистить форму и удалить сохранённый черновик?')) clearForm();
});
settingsButton.addEventListener('click', openSettings);
saveSettingsButton.addEventListener('click', event => {
  event.preventDefault();
  saveSettings();
  settingsDialog.close();
});

[titleInput, descriptionInput, priceInput, skuInput, quantityInput, productTypeInput, vkCategoryInput, albumInput, activeInput]
  .forEach(input => {
    input.addEventListener('input', () => {
      updatePreview();
      markChanged();
    });
    input.addEventListener('change', () => {
      updatePreview();
      markChanged();
    });
  });

loadDraft();
updatePreview();
