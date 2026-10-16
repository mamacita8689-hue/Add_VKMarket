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
const groupIdInput = document.querySelector('#groupId');
const apiUrlInput = document.querySelector('#apiUrl');
const saveSettingsButton = document.querySelector('#saveSettingsButton');

const DRAFT_KEY = 'vk-market-product-draft-v2';
const MAX_PHOTOS = 5;
let photos = [];
let toastTimer;
let serverConfigured = false;

function showToast(message, type = 'normal') {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('is-error', type === 'error');
  toast.classList.add('is-visible');
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 3200);
}

function formatPrice(value) {
  const price = Number(value);
  if (!Number.isFinite(price) || price <= 0) return '0 ₽';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(price)} ₽`;
}

function updatePreview() {
  previewTitle.textContent = titleInput.value.trim() || 'Название товара';
  previewPrice.textContent = formatPrice(priceInput.value);
  previewDescription.textContent = descriptionInput.value.trim() || 'Здесь появится краткое описание товара.';
  previewType.textContent = productTypeInput.value || 'Товар';
  previewStock.textContent = quantityInput.value === '' ? 'Остаток не указан' : `В наличии: ${quantityInput.value} шт.`;
  document.querySelector('#titleCount').textContent = `${titleInput.value.length} / 120`;
  document.querySelector('#descriptionCount').textContent = `${descriptionInput.value.length} / 4000`;

  if (photos[0]?.dataUrl) {
    previewImage.src = photos[0].dataUrl;
    previewImage.hidden = false;
    document.querySelector('.vk-card__placeholder').hidden = true;
  } else {
    previewImage.hidden = true;
    document.querySelector('.vk-card__placeholder').hidden = false;
  }
}

function renderPhotos() {
  photoGrid.replaceChildren();
  photos.forEach((photo, index) => {
    const item = document.createElement('div');
    item.className = 'photo-item';
    const image = document.createElement('img');
    image.src = photo.dataUrl;
    image.alt = `Фото товара ${index + 1}`;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'photo-item__remove';
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      photos.splice(index, 1);
      renderPhotos();
      updatePreview();
      markChanged();
    });
    item.append(image, remove);
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
  if (remaining <= 0) return showToast('Можно добавить не больше 5 фотографий', 'error');

  for (const file of candidates.slice(0, remaining)) {
    if (file.size > 12_000_000) {
      showToast(`Файл «${file.name}» больше 12 МБ`, 'error');
      continue;
    }
    photos.push({ name: file.name, dataUrl: await fileToDataUrl(file), file });
  }
  photoInput.value = '';
  renderPhotos();
  updatePreview();
  markChanged();
}

photoInput.addEventListener('change', event => addPhotos(event.target.files));
['dragenter', 'dragover'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.add('is-dragging');
}));
['dragleave', 'drop'].forEach(type => dropzone.addEventListener(type, event => {
  event.preventDefault();
  dropzone.classList.remove('is-dragging');
}));
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
  if (data.vkCategory != null) vkCategoryInput.dataset.savedValue = data.vkCategory;
  if (data.album != null) albumInput.dataset.savedValue = data.album;
  activeInput.checked = data.active ?? true;
  updatePreview();
}

function markChanged() {
  draftStatus.textContent = 'Есть несохранённые изменения';
}

function saveDraft() {
  localStorage.setItem(DRAFT_KEY, JSON.stringify({ data: getFormData(), savedAt: new Date().toISOString() }));
  draftStatus.textContent = 'Черновик сохранён';
  showToast('Черновик сохранён. Фото после перезагрузки нужно выбрать заново.');
}

function loadDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    if (!saved) return;
    setFormData(saved.data);
    draftStatus.textContent = 'Черновик восстановлен';
  } catch {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function clearValidation() {
  [titleInput, descriptionInput, priceInput, vkCategoryInput].forEach(input => input.classList.remove('is-invalid'));
  document.querySelector('#titleError').textContent = '';
  document.querySelector('#descriptionError').textContent = '';
  document.querySelector('#priceError').textContent = '';
}

function validateForm() {
  clearValidation();
  let valid = true;
  if (!titleInput.value.trim()) { titleInput.classList.add('is-invalid'); document.querySelector('#titleError').textContent = 'Укажите название'; valid = false; }
  if (!descriptionInput.value.trim()) { descriptionInput.classList.add('is-invalid'); document.querySelector('#descriptionError').textContent = 'Добавьте описание'; valid = false; }
  if (!priceInput.value || Number(priceInput.value) <= 0) { priceInput.classList.add('is-invalid'); document.querySelector('#priceError').textContent = 'Укажите цену больше 0'; valid = false; }
  if (!vkCategoryInput.value) { vkCategoryInput.classList.add('is-invalid'); valid = false; }
  if (!photos.length) { showToast('Добавьте хотя бы одну фотографию', 'error'); valid = false; }
  if (!valid) document.querySelector('.is-invalid')?.focus();
  return valid;
}

async function apiGet(path) {
  const response = await fetch(path);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка ${response.status}`);
  return data;
}

async function loadVkData() {
  try {
    const health = await apiGet('/api/health');
    serverConfigured = Boolean(health.configured);
    groupIdInput.value = health.groupId || '';
    apiUrlInput.value = window.location.origin;
    groupIdInput.disabled = true;
    apiUrlInput.disabled = true;

    if (!serverConfigured) {
      draftStatus.textContent = 'VK не подключён';
      return;
    }

    const [categories, albums] = await Promise.all([apiGet('/api/categories'), apiGet('/api/albums')]);
    vkCategoryInput.innerHTML = '<option value="">Выберите категорию VK</option>';
    for (const item of categories.items || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.name || item.title || `Категория ${item.id}`;
      vkCategoryInput.append(option);
    }

    albumInput.innerHTML = '<option value="">Без подборки</option>';
    for (const item of albums.items || []) {
      const option = document.createElement('option');
      option.value = item.id;
      option.textContent = item.title || `Подборка ${item.id}`;
      albumInput.append(option);
    }

    if (vkCategoryInput.dataset.savedValue) vkCategoryInput.value = vkCategoryInput.dataset.savedValue;
    if (albumInput.dataset.savedValue) albumInput.value = albumInput.dataset.savedValue;
  } catch (error) {
    serverConfigured = false;
    showToast(`Не удалось получить данные VK: ${error.message}`, 'error');
  }
}

async function publishProduct() {
  if (!serverConfigured) {
    showToast('Сначала настройте VK_GROUP_ID и VK_ACCESS_TOKEN на сервере', 'error');
    settingsDialog.showModal();
    return;
  }
  if (!validateForm()) return showToast('Проверьте обязательные поля', 'error');

  const payload = new FormData();
  payload.append('product', JSON.stringify(getFormData()));
  photos.forEach((photo, index) => payload.append('photos', photo.file, photo.name || `product-${index + 1}.jpg`));

  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Публикация…';

  try {
    const response = await fetch('/api/products', { method: 'POST', body: payload });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Ошибка ${response.status}`);
    localStorage.removeItem(DRAFT_KEY);
    draftStatus.textContent = `Опубликовано · товар ${result.itemId}`;
    showToast('Товар успешно опубликован в VK');
    if (result.url && confirm('Товар опубликован. Открыть его во ВКонтакте?')) window.open(result.url, '_blank', 'noopener');
  } catch (error) {
    saveDraft();
    showToast(`Не удалось опубликовать: ${error.message}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Опубликовать в VK';
  }
}

form.addEventListener('submit', event => { event.preventDefault(); publishProduct(); });
saveDraftButton.addEventListener('click', saveDraft);
clearButton.addEventListener('click', () => {
  if (!confirm('Очистить форму и удалить черновик?')) return;
  form.reset();
  photos = [];
  localStorage.removeItem(DRAFT_KEY);
  renderPhotos();
  setFormData({});
  draftStatus.textContent = 'Новый черновик';
});
settingsButton.addEventListener('click', () => settingsDialog.showModal());
saveSettingsButton.addEventListener('click', event => { event.preventDefault(); settingsDialog.close(); });

[titleInput, descriptionInput, priceInput, skuInput, quantityInput, productTypeInput, vkCategoryInput, albumInput, activeInput].forEach(input => {
  input.addEventListener('input', () => { updatePreview(); markChanged(); });
  input.addEventListener('change', () => { updatePreview(); markChanged(); });
});

loadDraft();
updatePreview();
loadVkData();
