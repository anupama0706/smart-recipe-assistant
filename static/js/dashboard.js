/**
 * Smart Recipe Assistant - Unified Workspace Controller
 * Merged Dashboard & Recipe Studio single-page interactive controller
 */

document.addEventListener('DOMContentLoaded', () => {
  // In-memory client state object
  const state = {
    selectedDish: null,
    availableIngredients: [],
    missingIngredients: [],
    substitutions: {},
    recipeDetails: null,
    chatHistory: [],
    // Extended operational state
    servings: 2,
    dishes: [],
    requiredIngredients: [],
    finalIngredients: [],
    currentRecipe: null,
    activeSubstitutionTarget: null
  };

  // --------------------------------------------------------------------------
  // DOM Elements Selection
  // --------------------------------------------------------------------------
  // Mode Switcher Elements
  const tabIngredients = document.getElementById('tab-ingredients');
  const tabDish = document.getElementById('tab-dish');
  const panelIngredients = document.getElementById('panel-ingredients');
  const panelDish = document.getElementById('panel-dish');

  // Mode 1 Elements (Ingredients)
  const ingredientsInput = document.getElementById('ingredients-input');
  const suggestionChips = document.getElementById('suggestion-chips');
  const btnFindDishes = document.getElementById('btn-find-dishes');

  // Mode 2 Elements (Dish Search)
  const dishNameInput = document.getElementById('dish-name-input');
  const dashServingsDec = document.getElementById('dash-servings-dec');
  const dashServingsInc = document.getElementById('dash-servings-inc');
  const dashServingsVal = document.getElementById('dash-servings-val');
  const dishAvailableInput = document.getElementById('dish-available-input');
  const btnCookDish = document.getElementById('btn-cook-dish');

  // Feature Highlights & Suggested Dishes Panel
  const featuresOverview = document.getElementById('features-overview');
  const suggestedDishesSection = document.getElementById('suggested-dishes-section');
  const dishesContainer = document.getElementById('dishes-container');
  const dishesCountWrap = document.getElementById('dishes-count-wrap');
  const dishesCountTag = document.getElementById('dishes-count-tag');
  const dishesSkeleton = document.getElementById('dishes-skeleton');
  const dishesList = document.getElementById('dishes-list');
  const dishesInitialEmpty = document.getElementById('dishes-initial-empty');

  // Studio Canvas Elements
  const studioContainer = document.getElementById('studio-container');
  const studioPlaceholder = document.getElementById('studio-placeholder');
  const studioActive = document.getElementById('studio-active');

  // Studio Header Elements
  const studioDishTitle = document.getElementById('studio-dish-title');
  const studioPrepTime = document.getElementById('studio-prep-time');
  const studioCookTime = document.getElementById('studio-cook-time');
  const studioServingsDec = document.getElementById('studio-servings-dec');
  const studioServingsInc = document.getElementById('studio-servings-inc');
  const studioServingsVal = document.getElementById('studio-servings-val');
  const btnSaveRecipe = document.getElementById('btn-save-recipe');
  const saveBtnText = document.getElementById('save-btn-text');

  // Studio Checklist Elements
  const studioIngredientsList = document.getElementById('studio-ingredients-list');
  const studioAvailableList = document.getElementById('studio-available-list') || studioIngredientsList;
  const studioMissingList = document.getElementById('studio-missing-list') || studioIngredientsList;
  const btnGenerateRecipe = document.getElementById('btn-generate-recipe');

  // Studio Instructions Elements
  const studioInstructionsSection = document.getElementById('studio-instructions-section');
  const studioRecipeIngredientsChecklist = document.getElementById('studio-recipe-ingredients-checklist');
  const studioInstructionsList = document.getElementById('studio-instructions-list');

  // Chef AI Chat Elements
  const studioChatRecipeName = document.getElementById('studio-chat-recipe-name');
  const studioChatGreetingDish = document.getElementById('studio-chat-greeting-dish');
  const studioChatMessages = document.getElementById('studio-chat-messages');
  const studioChatQuickChips = document.getElementById('studio-chat-quick-chips');
  const studioChatForm = document.getElementById('studio-chat-form');
  const studioChatInput = document.getElementById('studio-chat-input');
  const studioChatSendBtn = document.getElementById('studio-chat-send-btn');

  // Substitution Modal Elements
  const modalSub = document.getElementById('modal-substitution');
  const subTargetName = document.getElementById('sub-target-name');
  const subDishName = document.getElementById('sub-dish-name');
  const substitutesList = document.getElementById('substitutes-list');
  const subModalClose = document.getElementById('sub-modal-close');
  const subModalCancel = document.getElementById('sub-modal-cancel');

  let sidebarServings = 2;

  // --------------------------------------------------------------------------
  // Helper Utilities
  // --------------------------------------------------------------------------
  function parseCommaList(str) {
    if (!str) return [];
    return str
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }

  function setButtonLoading(btn, isLoading, loadingText = 'Loading...') {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="btn-spinner"></span> ${loadingText}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) {
        btn.innerHTML = btn.dataset.originalHtml;
      }
    }
  }

  // --------------------------------------------------------------------------
  // Tab Switching
  // --------------------------------------------------------------------------
  if (tabIngredients && tabDish) {
    tabIngredients.addEventListener('click', () => {
      tabIngredients.classList.add('active');
      tabIngredients.setAttribute('aria-selected', 'true');
      tabDish.classList.remove('active');
      tabDish.setAttribute('aria-selected', 'false');

      panelIngredients.classList.remove('hidden');
      panelDish.classList.add('hidden');
    });

    tabDish.addEventListener('click', () => {
      tabDish.classList.add('active');
      tabDish.setAttribute('aria-selected', 'true');
      tabIngredients.classList.remove('active');
      tabIngredients.setAttribute('aria-selected', 'false');

      panelDish.classList.remove('hidden');
      panelIngredients.classList.add('hidden');
    });
  }

  // --------------------------------------------------------------------------
  // Quick Pantry Chips
  // --------------------------------------------------------------------------
  if (suggestionChips && ingredientsInput) {
    suggestionChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      const item = chip.getAttribute('data-item') || chip.textContent.replace('+', '').trim();
      let current = ingredientsInput.value.trim();

      if (!current) {
        ingredientsInput.value = item;
      } else {
        const parts = current.split(',').map(p => p.trim().toLowerCase());
        if (!parts.includes(item.toLowerCase())) {
          ingredientsInput.value = `${current}, ${item}`;
        }
      }
      ingredientsInput.focus();
    });
  }

  // --------------------------------------------------------------------------
  // Servings Stepper (Sidebar Mode 2)
  // --------------------------------------------------------------------------
  if (dashServingsDec && dashServingsInc && dashServingsVal) {
    dashServingsDec.addEventListener('click', () => {
      if (sidebarServings > 1) {
        sidebarServings--;
        dashServingsVal.textContent = sidebarServings;
      }
    });

    dashServingsInc.addEventListener('click', () => {
      if (sidebarServings < 20) {
        sidebarServings++;
        dashServingsVal.textContent = sidebarServings;
      }
    });
  }

  // --------------------------------------------------------------------------
  // Mode 1 Submit: Suggest Dishes
  // --------------------------------------------------------------------------
  if (btnFindDishes && ingredientsInput) {
    btnFindDishes.addEventListener('click', async () => {
      const raw = ingredientsInput.value.trim();
      const ingredients = parseCommaList(raw);

      if (ingredients.length === 0) {
        if (window.showToast) window.showToast('Please enter at least one ingredient.', 'warning');
        ingredientsInput.focus();
        return;
      }

      state.availableIngredients = ingredients;
      setButtonLoading(btnFindDishes, true, 'Finding Recipes...');
      
      // Decouple transitions: Hide feature overview welcome state and smooth-scroll to dedicated results section
      if (featuresOverview) {
        featuresOverview.classList.add('hidden');
      }
      if (suggestedDishesSection) {
        suggestedDishesSection.classList.remove('hidden');
        suggestedDishesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      // UI feedback in dishes panel
      if (dishesInitialEmpty) dishesInitialEmpty.classList.add('hidden');
      if (dishesSkeleton) dishesSkeleton.classList.remove('hidden');
      dishesList.innerHTML = '';

      try {
        const response = await fetch('/api/suggest-dishes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ingredients })
        });

        const result = await response.json();
        setButtonLoading(btnFindDishes, false);
        if (dishesSkeleton) dishesSkeleton.classList.add('hidden');

        if (response.ok && result.success && result.data) {
          const dishes = result.data.dishes || [];
          state.dishes = dishes;
          renderSuggestedDishes(dishes);
          if (dishes.length === 0) {
            if (window.showToast) window.showToast('No matching dishes found. Try adding more pantry items.', 'info');
          } else {
            if (window.showToast) window.showToast(`Found ${dishes.length} dishes matching your pantry!`, 'success');
          }
        } else {
          if (window.showToast) window.showToast(result.error || 'Unable to suggest dishes at this time.', 'error');
          if (dishesInitialEmpty) dishesInitialEmpty.classList.remove('hidden');
        }
      } catch (err) {
        setButtonLoading(btnFindDishes, false);
        if (dishesSkeleton) dishesSkeleton.classList.add('hidden');
        if (dishesInitialEmpty) dishesInitialEmpty.classList.remove('hidden');
        if (window.showToast) window.showToast('Connection error. Please try again.', 'error');
      }
    });
  }

  // --------------------------------------------------------------------------
  // Render Suggested Dishes (Left Panel)
  // --------------------------------------------------------------------------
  function renderSuggestedDishes(dishes) {
    if (featuresOverview) {
      featuresOverview.classList.add('hidden');
    }
    if (suggestedDishesSection) {
      suggestedDishesSection.classList.remove('hidden');
    }

    dishesList.innerHTML = '';
    if (dishesCountTag) dishesCountTag.textContent = `${dishes.length} recipes`;
    if (dishesCountWrap) {
      if (dishes && dishes.length > 0) {
        dishesCountWrap.classList.remove('hidden');
      } else {
        dishesCountWrap.classList.add('hidden');
      }
    }

    if (!dishes || dishes.length === 0) {
      if (dishesInitialEmpty) dishesInitialEmpty.classList.remove('hidden');
      return;
    }

    dishes.forEach((dish) => {
      const card = document.createElement('div');
      card.className = 'dish-card';
      card.dataset.dishName = dish.name;

      if (state.selectedDish && state.selectedDish.toLowerCase() === dish.name.toLowerCase()) {
        card.classList.add('active');
      }

      const tags = (dish.available_ingredients_used || []).map(ing => 
        `<span class="tag-badge"><svg width="12" height="12" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/></svg> ${escapeHtml(ing)}</span>`
      ).join('');

      card.innerHTML = `
        <div class="dish-card-main">
          <div class="dish-card-top-row">
            <h4 class="dish-card-title">${escapeHtml(dish.name)}</h4>
            <span class="active-pill">Selected</span>
          </div>
          <p class="dish-card-desc">${escapeHtml(dish.description)}</p>
          
          <div class="dish-card-pantry-row">
            <span class="dish-pantry-label">Uses from your pantry:</span>
            <div class="dish-ingredients-tags">
              ${tags || '<span class="text-muted" style="font-size: 0.8rem;">Pantry staples</span>'}
            </div>
          </div>
        </div>

        <div class="dish-card-action">
          <button type="button" class="btn btn-primary btn-sm select-dish-btn" style="background-color: #E05320; border-color: #E05320; color: #FFFFFF;">
            Open
          </button>
        </div>
      `;

      const selectBtn = card.querySelector('.select-dish-btn');
      if (selectBtn) {
        selectBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          selectDish(dish.name);
        });
      }

      card.addEventListener('click', () => {
        selectDish(dish.name);
      });

      dishesList.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // Mode 2 Submit: Direct Dish
  // --------------------------------------------------------------------------
  if (btnCookDish && dishNameInput) {
    btnCookDish.addEventListener('click', async () => {
      const dishName = dishNameInput.value.trim();
      const rawAvailable = dishAvailableInput ? dishAvailableInput.value.trim() : '';
      const availableList = parseCommaList(rawAvailable);

      if (!dishName) {
        if (window.showToast) window.showToast('Please enter a dish name.', 'warning');
        dishNameInput.focus();
        return;
      }

      state.availableIngredients = availableList;
      state.servings = sidebarServings;
      setButtonLoading(btnCookDish, true, 'Analyzing Dish...');

      // Render dish card in left list
      const syntheticDish = {
        name: dishName,
        description: 'Direct dish search request.',
        available_ingredients_used: availableList
      };
      state.dishes = [syntheticDish];
      renderSuggestedDishes(state.dishes);

      // Select dish directly in the Studio
      await selectDish(dishName, sidebarServings, availableList);
      setButtonLoading(btnCookDish, false);
    });
  }

  // --------------------------------------------------------------------------
  // Dish Selection & Transition to Interactive Studio Canvas
  // --------------------------------------------------------------------------
  async function selectDish(dishName, servings = state.servings || 2, availableList = state.availableIngredients || []) {
    state.selectedDish = dishName;
    state.servings = servings;
    state.availableIngredients = availableList;

    // Highlight the active card in the left list
    document.querySelectorAll('.dish-card').forEach((c) => {
      if (c.dataset.dishName && c.dataset.dishName.toLowerCase() === dishName.toLowerCase()) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    // Reveal interactive studio canvas
    if (studioContainer) {
      studioContainer.classList.remove('hidden');
      studioContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (studioPlaceholder) studioPlaceholder.classList.add('hidden');
    if (studioActive) studioActive.classList.remove('hidden');

    // Populate Studio Header
    if (studioDishTitle) studioDishTitle.textContent = dishName;
    if (studioServingsVal) studioServingsVal.textContent = state.servings;
    if (studioPrepTime) studioPrepTime.textContent = '15 mins';
    if (studioCookTime) studioCookTime.textContent = '25 mins';

    // Reset instructions and save button
    if (studioInstructionsSection) studioInstructionsSection.classList.add('hidden');
    if (saveBtnText) saveBtnText.textContent = 'Save Recipe';
    if (btnSaveRecipe) {
      btnSaveRecipe.classList.remove('btn-success');
      btnSaveRecipe.disabled = false;
    }

    // Update Chef AI Context
    if (studioChatRecipeName) studioChatRecipeName.textContent = dishName;
    if (studioChatGreetingDish) studioChatGreetingDish.textContent = dishName;

    // Display skeleton state in checklist
    if (studioIngredientsList) {
      studioIngredientsList.innerHTML = `
        <li class="skeleton-card" style="height: 60px;"></li>
        <li class="skeleton-card" style="height: 60px;"></li>
        <li class="skeleton-card" style="height: 60px;"></li>
      `;
    }

    try {
      // Step A: Select Dish API call
      try {
        await fetch('/api/select-dish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dish: dishName,
            available_ingredients: state.availableIngredients
          })
        });
      } catch (selErr) {
        console.warn('Non-blocking select-dish warning:', selErr);
      }

      // Step B: Generate Ingredients
      const ingRes = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dish: dishName,
          servings: state.servings
        })
      });

      if (!ingRes.ok) {
        const errorData = await ingRes.json().catch(() => null);
        const errMsg = (errorData && errorData.error) ? errorData.error : `Server error (${ingRes.status})`;
        throw new Error(errMsg);
      }

      const ingData = await ingRes.json();

      if (!ingData.success || !ingData.data) {
        throw new Error(ingData.error || 'Failed to generate ingredients.');
      }

      state.requiredIngredients = ingData.data.ingredients || [];
      state.finalIngredients = [...state.requiredIngredients];

      // Step C: Check Missing Ingredients
      let missing = [];
      if (state.availableIngredients && state.availableIngredients.length > 0) {
        try {
          const missRes = await fetch('/api/check-missing', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              required_ingredients: state.requiredIngredients,
              available_ingredients: state.availableIngredients
            })
          });
          const missData = await missRes.json();
          if (missRes.ok && missData.success) {
            missing = missData.data.missing_ingredients || [];
          }
        } catch (mErr) {
          console.warn('check-missing warning:', mErr);
        }
      } else {
        // If no pantry items provided, all are considered missing
        missing = state.requiredIngredients.map(item => typeof item === 'object' ? item.name : item);
      }
      state.missingIngredients = missing;

      // Render Checklist immediately removing skeletons
      renderStudioChecklist();
      if (window.showToast) window.showToast(`Loaded "${dishName}" into Recipe Studio!`, 'info');

    } catch (err) {
      console.error('Error in selectDish:', err);
      // Remove skeleton classes or placeholders immediately and show informative error
      if (studioIngredientsList) {
        studioIngredientsList.innerHTML = `<li class="ingredient-item-card is-missing" style="color: var(--warning);"><span class="ing-name">Failed to load ingredients: ${escapeHtml(err.message || 'Error analyzing ingredients for studio.')}</span></li>`;
      }

      if (window.showToast) window.showToast(err.message || 'Error analyzing ingredients for studio.', 'error');
    } finally {
      // Skeletons are guaranteed removed from DOM
      if (studioIngredientsList) {
        studioIngredientsList.querySelectorAll('.skeleton-card').forEach(el => el.remove());
      }
    }
  }

  // --------------------------------------------------------------------------
  // Render Studio Checklist (Single Unified Required Ingredients Container)
  // --------------------------------------------------------------------------
  function renderStudioChecklist() {
    if (!studioIngredientsList) return;
    studioIngredientsList.innerHTML = '';

    const reqList = state.finalIngredients.length > 0 ? state.finalIngredients : state.requiredIngredients;
    const missingSet = new Set((state.missingIngredients || []).map(m => m.toLowerCase()));
    const availableSet = new Set((state.availableIngredients || []).map(a => a.toLowerCase()));

    if (!reqList || reqList.length === 0) {
      studioIngredientsList.innerHTML = '<li class="ingredient-item-card"><span class="ing-name" style="font-size: 0.85rem;">No ingredients found for this dish.</span></li>';
      return;
    }

    reqList.forEach((item) => {
      const name = typeof item === 'object' ? item.name : item;
      const qty = typeof item === 'object' && item.quantity ? item.quantity : '';
      const category = typeof item === 'object' && item.category ? item.category : 'core';

      const li = document.createElement('li');
      li.className = 'ingredient-item-card';
      li.dataset.name = name;

      li.innerHTML = `
        <div class="ingredient-item-details">
          <div class="ing-name-row">
            <span class="ing-name">${escapeHtml(name)}</span>
            ${qty ? `<span class="ing-qty">${escapeHtml(qty)}</span>` : ''}
            <span class="category-tag category-${escapeHtml(category)}">${escapeHtml(category)}</span>
          </div>
        </div>

        <div class="ingredient-item-actions">
          <button type="button" class="btn btn-outline btn-sm btn-find-sub" data-name="${escapeHtml(name)}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 0.35rem;"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg> Find Substitute
          </button>
        </div>
      `;

      const subBtn = li.querySelector('.btn-find-sub');
      if (subBtn) {
        subBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openSubstitutionModal(name);
        });
      }

      studioIngredientsList.appendChild(li);
    });
  }

  // --------------------------------------------------------------------------
  // Studio Servings Stepper
  // --------------------------------------------------------------------------
  if (studioServingsDec && studioServingsInc) {
    studioServingsDec.addEventListener('click', () => changeStudioServings(-1));
    studioServingsInc.addEventListener('click', () => changeStudioServings(1));
  }

  async function changeStudioServings(delta) {
    const next = (state.servings || 2) + delta;
    if (next < 1 || next > 20) return;
    state.servings = next;
    if (studioServingsVal) studioServingsVal.textContent = state.servings;

    if (window.showLoader) window.showLoader(`Recalculating for ${state.servings} servings...`);
    try {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dish: state.selectedDish,
          servings: state.servings
        })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        state.requiredIngredients = data.data.ingredients || [];
        state.finalIngredients = [...state.requiredIngredients];

        const missRes = await fetch('/api/check-missing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            required_ingredients: state.requiredIngredients,
            available_ingredients: state.availableIngredients
          })
        });
        const missData = await missRes.json();
        if (missRes.ok && missData.success) {
          state.missingIngredients = missData.data.missing_ingredients || [];
        }
        renderStudioChecklist();
      }
    } catch (e) {
      if (window.showToast) window.showToast('Could not adjust servings portions.', 'error');
    } finally {
      if (window.hideLoader) window.hideLoader();
    }
  }

  // --------------------------------------------------------------------------
  // Substitution Recommendations Modal
  // --------------------------------------------------------------------------
  async function openSubstitutionModal(missingIngredient) {
    state.activeSubstitutionTarget = missingIngredient;
    if (subTargetName) subTargetName.textContent = missingIngredient;
    if (subDishName) subDishName.textContent = state.selectedDish;
    if (substitutesList) substitutesList.innerHTML = '<div class="skeleton-card"></div><div class="skeleton-card"></div>';

    if (modalSub) {
      modalSub.classList.remove('hidden');
      modalSub.setAttribute('aria-hidden', 'false');
    }

    try {
      const res = await fetch('/api/substitute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dish: state.selectedDish,
          missing_ingredient: missingIngredient,
          current_ingredients: state.finalIngredients
        })
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        if (substitutesList) substitutesList.innerHTML = `<p class="text-muted">${escapeHtml(data.error || 'No substitutes found.')}</p>`;
        return;
      }

      const substitutes = data.data.substitutes || [];
      state.substitutions[missingIngredient] = substitutes;
      substitutesList.innerHTML = '';

      if (substitutes.length === 0) {
        substitutesList.innerHTML = '<p class="text-muted">No practical culinary substitutes found for this item.</p>';
        return;
      }

      substitutes.forEach((sub) => {
        const card = document.createElement('div');
        card.className = 'substitute-card';
        card.innerHTML = `
          <div class="sub-header">
            <span class="sub-name">${escapeHtml(sub.name)}</span>
            <span class="sub-qty">${escapeHtml(sub.quantity)}</span>
          </div>
          <div class="sub-detail">
            <strong>Why it works:</strong> ${escapeHtml(sub.reason)}
          </div>
          <div class="sub-detail">
            <strong>Flavor &amp; texture impact:</strong> ${escapeHtml(sub.effect)}
          </div>
          <div class="sub-actions">
            <button type="button" class="btn btn-primary btn-sm btn-apply-sub">
              Apply This Substitute
            </button>
          </div>
        `;

        card.querySelector('.btn-apply-sub').addEventListener('click', () => {
          applySubstitution(missingIngredient, sub.name);
        });

        substitutesList.appendChild(card);
      });
    } catch (err) {
      if (substitutesList) substitutesList.innerHTML = '<p class="text-muted">Error connecting to substitution service.</p>';
    }
  }

  async function applySubstitution(missingName, substituteName) {
    if (window.showLoader) window.showLoader(`Applying ${substituteName} to your recipe...`);
    try {
      const res = await fetch('/api/select-substitution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          missing_ingredient: missingName,
          substitute: substituteName
        })
      });
      const data = await res.json();
      if (window.hideLoader) window.hideLoader();

      if (!res.ok || !data.success) {
        if (window.showToast) window.showToast(data.error || 'Failed to apply substitute.', 'error');
        return;
      }

      // Update final ingredients list in local state
      state.finalIngredients = data.data.final_ingredients || state.finalIngredients;

      // Remove from missing list and add substitute to available ingredients
      state.missingIngredients = (state.missingIngredients || []).filter(
        item => item.toLowerCase() !== missingName.toLowerCase()
      );
      if (!state.availableIngredients.some(i => i.toLowerCase() === substituteName.toLowerCase())) {
        state.availableIngredients.push(substituteName);
      }

      closeSubModal();
      renderStudioChecklist();
      if (window.showToast) window.showToast(`Substituted "${missingName}" with "${substituteName}"!`, 'success');
    } catch (err) {
      if (window.hideLoader) window.hideLoader();
      if (window.showToast) window.showToast('Error applying substitution.', 'error');
    }
  }

  function closeSubModal() {
    if (modalSub) {
      modalSub.classList.add('hidden');
      modalSub.setAttribute('aria-hidden', 'true');
    }
    state.activeSubstitutionTarget = null;
  }

  if (subModalClose) subModalClose.addEventListener('click', closeSubModal);
  if (subModalCancel) subModalCancel.addEventListener('click', closeSubModal);
  if (modalSub) {
    modalSub.addEventListener('click', (e) => {
      if (e.target === modalSub) closeSubModal();
    });
  }

  // --------------------------------------------------------------------------
  // Generate Chronological Recipe Instructions
  // --------------------------------------------------------------------------
  if (btnGenerateRecipe) {
    btnGenerateRecipe.addEventListener('click', async () => {
      if (!state.selectedDish) {
        const errorMsg = 'Please select a dish first.';
        console.error(errorMsg);
        alert(errorMsg);
        if (window.showToast) window.showToast(errorMsg, 'warning');
        return;
      }

      const ingredientsToUse = (state.finalIngredients && state.finalIngredients.length > 0)
        ? state.finalIngredients
        : (state.requiredIngredients || []);

      setButtonLoading(btnGenerateRecipe, true, 'Generating Instructions...');

      try {
        const res = await fetch('/api/generate-recipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dish: state.selectedDish,
            dish_name: state.selectedDish,
            servings: state.servings,
            ingredients: ingredientsToUse
          })
        });

        const data = await res.json();
        setButtonLoading(btnGenerateRecipe, false);
        btnGenerateRecipe.disabled = false;
        btnGenerateRecipe.innerHTML = 'Generate Recipe';

        if (!res.ok || !data.success) {
          const failReason = (data && data.error) ? data.error : `Failed to generate recipe instructions (HTTP ${res.status}).`;
          console.error('Error generating recipe instructions:', failReason);
          alert(failReason);
          if (window.showToast) window.showToast(failReason, 'error');
          return;
        }

        state.recipeDetails = data.data;
        state.currentRecipe = data.data;
        renderRecipeInstructions(state.recipeDetails);

        if (window.showToast) window.showToast('Instructions generated! Happy cooking.', 'success');
      } catch (err) {
        console.error('Error generating recipe instructions:', err);
        setButtonLoading(btnGenerateRecipe, false);
        btnGenerateRecipe.disabled = false;
        btnGenerateRecipe.innerHTML = 'Generate Recipe';
        const failureMessage = (err && err.message) ? err.message : 'Network error while generating recipe.';
        alert(`Failed to generate recipe: ${failureMessage}`);
        if (window.showToast) window.showToast(`Network error: ${failureMessage}`, 'error');
      }
    });
  }

  function renderRecipeInstructions(recipe) {
    if (!recipe) return;

    if (studioPrepTime) studioPrepTime.textContent = recipe.preparation_time || '15 mins';
    if (studioCookTime) studioCookTime.textContent = recipe.cook_time || '25 mins';
    if (studioServingsVal) studioServingsVal.textContent = recipe.servings || state.servings;

    // Reset save button state
    if (saveBtnText) saveBtnText.textContent = 'Save Recipe';
    if (btnSaveRecipe) {
      btnSaveRecipe.classList.remove('btn-success');
      btnSaveRecipe.disabled = false;
    }

    // Render interactive checklist in instructions section
    if (studioRecipeIngredientsChecklist) {
      studioRecipeIngredientsChecklist.innerHTML = '';
      const ingredients = recipe.ingredients || [];
      ingredients.forEach((ing) => {
        const name = typeof ing === 'object' ? ing.name : ing;
        const qty = typeof ing === 'object' && ing.quantity ? ing.quantity : '';

        const li = document.createElement('li');
        li.className = 'recipe-ing-check-item';
        li.innerHTML = `
          <input type="checkbox" class="recipe-checkbox" aria-label="Cross off ${escapeHtml(name)}">
          <label><strong>${escapeHtml(qty)}</strong> ${escapeHtml(name)}</label>
        `;

        li.addEventListener('click', (e) => {
          const checkbox = li.querySelector('.recipe-checkbox');
          if (e.target !== checkbox) {
            checkbox.checked = !checkbox.checked;
          }
          li.classList.toggle('checked', checkbox.checked);
        });

        studioRecipeIngredientsChecklist.appendChild(li);
      });
    }

    // Render numbered instructions
    if (studioInstructionsList) {
      studioInstructionsList.innerHTML = '';
      const instructions = recipe.instructions || [];
      instructions.forEach((stepText) => {
        const li = document.createElement('li');
        li.className = 'instruction-step';
        const cleanText = (typeof stepText === 'string' ? stepText : String(stepText || '')).replace(/^\d+[\.\)]\s*/, '');
        li.textContent = cleanText;
        studioInstructionsList.appendChild(li);
      });
    }

    // Unhide instructions section
    if (studioInstructionsSection) {
      studioInstructionsSection.classList.remove('hidden');
      studioInstructionsSection.style.display = 'block';
      studioInstructionsSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // Update Chef AI Greeting context
    if (studioChatRecipeName) studioChatRecipeName.textContent = recipe.dish_name;
    if (studioChatGreetingDish) studioChatGreetingDish.textContent = recipe.dish_name;
  }

  // --------------------------------------------------------------------------
  // Save Recipe CTA Button (Sync with DB)
  // --------------------------------------------------------------------------
  if (btnSaveRecipe) {
    btnSaveRecipe.addEventListener('click', async () => {
      const recipeToSave = state.recipeDetails || state.currentRecipe;

      if (!recipeToSave || !recipeToSave.dish_name) {
        if (window.showToast) window.showToast('Please select or generate a recipe first.', 'warning');
        return;
      }

      setButtonLoading(btnSaveRecipe, true, 'Saving...');
      try {
        const res = await fetch('/api/save-recipe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recipe: recipeToSave })
        });
        const data = await res.json();
        setButtonLoading(btnSaveRecipe, false);

        if (res.status === 401) {
          if (window.showToast) window.showToast('Please log in to save recipes to your cookbook.', 'warning');
          return;
        }

        if (res.ok && data.success) {
          if (saveBtnText) saveBtnText.textContent = 'Saved to Cookbook!';
          btnSaveRecipe.classList.add('btn-success');
          btnSaveRecipe.disabled = true;
          if (window.showToast) window.showToast(`"${recipeToSave.dish_name}" saved to your cookbook!`, 'success');
        } else {
          if (window.showToast) window.showToast(data.error || 'Could not save recipe.', 'error');
        }
      } catch (err) {
        setButtonLoading(btnSaveRecipe, false);
        if (window.showToast) window.showToast('Error saving recipe.', 'error');
      }
    });
  }

  // --------------------------------------------------------------------------
  // Embedded Chef AI Interactive Chat
  // --------------------------------------------------------------------------
  if (studioChatForm && studioChatInput) {
    studioChatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const message = studioChatInput.value.trim();
      if (!message) return;
      studioChatInput.value = '';
      sendChefChatMessage(message);
    });
  }

  if (studioChatQuickChips) {
    studioChatQuickChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.quick-chip');
      if (!chip) return;
      const prompt = chip.getAttribute('data-prompt');
      if (prompt) {
        sendChefChatMessage(prompt);
      }
    });
  }

  async function sendChefChatMessage(messageText) {
    if (!studioChatMessages) return;

    // Append user message bubble
    appendChatBubble('user', messageText);

    // Append typing indicator bubble
    const typingBubble = document.createElement('div');
    typingBubble.className = 'chat-bubble chat-bubble-ai typing-indicator-bubble';
    typingBubble.innerHTML = `
      <div class="bubble-avatar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M6 13.8a4 4 0 0 1 0-7.6 4 4 0 0 1 7.2-2.3 4 4 0 0 1 4.8 4.3A4 4 0 0 1 18 13.8"></path>
          <path d="M6 17h12"></path>
          <path d="M6 21h12"></path>
        </svg>
      </div>
      <div class="bubble-content">
        <div class="typing-dots">
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
          <span class="typing-dot"></span>
        </div>
      </div>
    `;
    studioChatMessages.appendChild(typingBubble);
    studioChatMessages.scrollTop = studioChatMessages.scrollHeight;

    const recipeContext = state.recipeDetails || {
      dish_name: state.selectedDish || 'Current Dish',
      servings: state.servings || 2,
      ingredients: state.finalIngredients || []
    };

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          recipe: recipeContext
        })
      });
      const data = await res.json();
      typingBubble.remove();

      if (res.ok && data.success && data.data) {
        appendChatBubble('ai', data.data.answer);
        state.chatHistory.push({ role: 'ai', content: data.data.answer });
      } else {
        appendChatBubble('ai', data.error || 'Sorry, I could not process your question right now.');
      }
    } catch (err) {
      typingBubble.remove();
      appendChatBubble('ai', 'Connection error. Please try asking again.');
    }
  }

  function appendChatBubble(sender, text) {
    const bubble = document.createElement('div');
    bubble.className = `chat-bubble chat-bubble-${sender}`;
    const avatar = sender === 'user' 
      ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>'
      : '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.8a4 4 0 0 1 0-7.6 4 4 0 0 1 7.2-2.3 4 4 0 0 1 4.8 4.3A4 4 0 0 1 18 13.8"></path><path d="M6 17h12"></path><path d="M6 21h12"></path></svg>';

    bubble.innerHTML = `
      <div class="bubble-avatar">${avatar}</div>
      <div class="bubble-content">
        <p>${escapeHtml(text)}</p>
      </div>
    `;

    studioChatMessages.appendChild(bubble);
    studioChatMessages.scrollTop = studioChatMessages.scrollHeight;
    state.chatHistory.push({ role: sender, content: text });
  }

  // --------------------------------------------------------------------------
  // Check Hash or Legacy Session Storage on Load
  // --------------------------------------------------------------------------
  const rawData = sessionStorage.getItem('smart_recipe_data');
  if (rawData) {
    try {
      const parsed = JSON.parse(rawData);
      sessionStorage.removeItem('smart_recipe_data'); // consume and clear
      if (parsed.availableIngredients) {
        state.availableIngredients = parsed.availableIngredients;
        if (ingredientsInput) ingredientsInput.value = parsed.availableIngredients.join(', ');
      }
      if (parsed.dishes && parsed.dishes.length > 0) {
        state.dishes = parsed.dishes;
        renderSuggestedDishes(state.dishes);
      }
      if (parsed.selectedDish) {
        selectDish(parsed.selectedDish, parsed.servings || 2, state.availableIngredients);
      }
    } catch (e) {
      // ignore JSON parse error
    }
  }
});

