// --- Funções globais de modal de atividades ---
function openAllActivitiesModal() {
    // Cria modal se não existir
    let modal = document.getElementById('all-activities-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'all-activities-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-60 z-[9999] flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 max-w-3xl w-full shadow-2xl relative max-h-[92vh] overflow-y-auto border-2 border-blue-200 dark:border-blue-900">
                <button onclick="closeAllActivitiesModal()" class="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-3xl font-bold transition">&times;</button>
                <h2 class="text-3xl font-extrabold mb-6 text-blue-700 dark:text-blue-300 tracking-tight text-center">Todas as Atividades</h2>
                <div class="flex flex-col md:flex-row gap-3 mb-6 items-center justify-between w-full">
                    <input id="activities-search" type="text" placeholder="Pesquisar por descrição..." class="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 transition" />
                    <select id="activities-order-filter" class="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-400 transition">
                        <option value="desc">Recentes Primeiro</option>
                        <option value="asc">Antigos Primeiro</option>
                    </select>
                </div>
                <div id="all-activities-list" class="space-y-4"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Função para renderizar atividades filtradas
    function renderActivitiesList(activities) {
        const list = document.getElementById('all-activities-list');
        if (!activities || activities.length === 0) {
            list.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">Nenhuma atividade encontrada</p>';
            return;
        }
        list.innerHTML = activities.map(activity => {
            let userInfo = '';
            if (activity.display_name) {
                userInfo = `<span class=\"ml-2 text-xs text-blue-700 dark:text-blue-300 font-semibold\">por ${activity.display_name}</span>`;
            }
            return `<div class=\"flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-700 rounded-xl border border-gray-200 dark:border-gray-600 shadow-sm\"><i class=\"fas fa-${getActivityIcon(activity.type)} text-2xl text-blue-400 dark:text-blue-300\"></i> <span class=\"flex-1\">${activity.description || ''}</span> ${userInfo} <span class=\"ml-auto text-xs text-gray-400\">${formatDate(activity.timestamp)}</span></div>`;
        }).join('');
    }

    // Carrega e filtra atividades
    let allActivities = [];
    function fetchAndRenderActivities() {
        supabaseClient
            .from('activities')
            .select('*')
            .eq('group_id', window.currentGroupId)
            .order('timestamp', { ascending: false })
            .then(({ data, error }) => {
                allActivities = data || [];
                applyFilters();
            });
    }

    function applyFilters() {
        const search = document.getElementById('activities-search').value.toLowerCase();
        const order = document.getElementById('activities-order-filter').value;
        let filtered = allActivities;
        if (search) {
            filtered = filtered.filter(a =>
                (a.description && a.description.toLowerCase().includes(search)) ||
                (a.display_name && a.display_name.toLowerCase().includes(search))
            );
        }
        // Ordenação
        filtered = filtered.slice().sort((a, b) => {
            if (order === 'asc') {
                return new Date(a.timestamp) - new Date(b.timestamp);
            } else {
                return new Date(b.timestamp) - new Date(a.timestamp);
            }
        });
        renderActivitiesList(filtered);
    }

    // Eventos de filtro
    setTimeout(() => {
        document.getElementById('activities-search').addEventListener('input', applyFilters);
        document.getElementById('activities-order-filter').addEventListener('change', applyFilters);
    }, 150);

    fetchAndRenderActivities();
    modal.classList.remove('hidden');
}

function closeAllActivitiesModal() {
    const modal = document.getElementById('all-activities-modal');
    if (modal) modal.classList.add('hidden');
}
// Defina o group_id globalmente como valor fixo para todos verem o mesmo conteúdo
window.currentGroupId = '00000000-0000-0000-0000-000000000001'; // UUID válido para todos os usuários
// Função para duplicar procedimento
async function duplicateProcedure(procId) {
    try {
        // Busca o procedimento original
        const { data, error } = await supabaseClient.from('procedures').select('*').eq('id', procId).single();
        if (error || !data) {
            alert('Erro ao buscar procedimento para duplicar.');
            return;
        }
        // Prepara novo procedimento
        const user_id = window.currentUser ? window.currentUser.id : null;
        const display_name = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.name)
            ? window.currentUser.user_metadata.name
            : (window.currentUser && (window.currentUser.name || window.currentUser.email)) || 'Usuário';
        const newProcedure = {
            title: data.title + ' (Cópia)',
            description: data.description,
            steps: data.steps,
            user_id,
            display_name,
            group_id: window.currentGroupId,
            created_at: new Date().toISOString()
        };
        // Salva novo procedimento
        const { error: insertError } = await supabaseClient.from('procedures').insert([newProcedure]);
        if (insertError) {
            alert('Erro ao duplicar procedimento: ' + insertError.message);
            return;
        }
        // Registra atividade
        await supabaseClient.from('activities').insert([
            {
                type: 'procedure',
                description: `Procedimento duplicado: ${data.title}`,
                user_id,
                display_name,
                action: 'duplicate',
                group_id: window.currentGroupId,
                timestamp: new Date().toISOString()
            }
        ]);
    // alert('Procedimento duplicado com sucesso!');
        loadProcedures();
    } catch (e) {
        alert('Erro ao duplicar procedimento.');
        console.error(e);
    }
}
// --- ATUALIZAÇÃO EM TEMPO REAL DAS ATIVIDADES ---
async function setupRealtimeActivities() {
    if (!window.activitiesChannel) {
        window.activitiesChannel = supabaseClient.channel('realtime-activities')
            .on('postgres_changes', {
                event: '*', // Captura INSERT, UPDATE, DELETE
                schema: 'public',
                table: 'activities'
            }, payload => {
                console.log('[Realtime] Mudança detectada em activities:', payload);
                loadRecentActivity();
            });
        const { error, subscription } = await window.activitiesChannel.subscribe();
        if (error) {
            console.error('[Realtime] Erro ao se inscrever no canal activities:', error);
        } else {
            console.log('[Realtime] Inscrito no canal activities com sucesso.');
        }
    }
}

// --- SUPABASE CONFIG ---
const SUPABASE_URL = 'https://sbvxmvwleoxnwcsopevx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNidnhtdndsZW94bndjc29wZXZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NTg2NjQsImV4cCI6MjA3MzUzNDY2NH0.2WrYkc5gxnux-0ei-1U4jF9RxGvD5DaJTh9lAch8nBQ';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Função para deletar procedimento
function deleteProcedure(procId) {
    showConfirmModal('Tem certeza que deseja excluir este procedimento?', async function() {
        const isAdmin = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.email === 'ericdudu1999@gmail.com');
        // Buscar o nome do procedimento ANTES de deletar
        let procName = '';
        try {
            const { data: procData, error: fetchError } = await supabaseClient.from('procedures').select('title').eq('id', procId).single();
            if (!fetchError && procData && procData.title) {
                procName = procData.title;
            } else {
                procName = '(desconhecido)';
            }
        } catch (e) {
            procName = '(desconhecido)';
        }

        let query = supabaseClient.from('procedures').delete();
        if (!isAdmin) {
            // Usuário comum só pode deletar o próprio procedimento
            query = query.eq('id', procId).eq('user_id', window.currentUser.id);
        } else {
            // ADM pode deletar qualquer procedimento
            query = query.eq('id', procId);
        }
        const { error } = await query;
        const display_name = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.name)
            ? window.currentUser.user_metadata.name
            : (window.currentUser && (window.currentUser.name || window.currentUser.email)) || 'Usuário';
        const user_id = window.currentUser ? window.currentUser.id : null;
        if (error) {
            alert('Erro ao excluir procedimento: ' + error.message);
        } else {
            // Registrar atividade de exclusão
            try {
                await supabaseClient.from('activities').insert([
                    {
                        type: 'procedure',
                        description: `Procedimento excluído: ${procName}`,
                        user_id,
                        display_name,
                        action: 'delete',
                        group_id: window.currentGroupId,
                        timestamp: new Date().toISOString()
                    }
                ]);
            } catch (e) {
                console.error('Erro ao registrar atividade:', e);
            }
            loadProcedures();
        }
    });
}
// Função para botão "Anterior" no modal de execução
function previousExecutionStep() {
    prevExecutionStep();
}

// Função para botão "Reiniciar" no modal de execução
function restartExecution() {
    if (!executionState.proc) return;
    executionState.step = 0;
    executionState.timer = 0;
    renderExecutionStep();
    updateExecutionTimerDisplay();
    startExecutionTimer();
}

// Finalizar execução (pode ser chamado de um botão extra se desejar)
function finishExecution() {
    stopExecutionTimer();
    alert('Execução finalizada! Tempo: ' + formatExecutionTime(executionState.timer));
    hideExecutionModal();
}
// --- Modal de Execução do Procedimento ---
let executionState = {
    proc: null,
    step: 0,
    timer: 0,
    timerInterval: null
};

function startProcedureExecution(procId) {
    const proc = procedures.find(p => String(p.id) === String(procId));
    if (!proc) return;
    executionState.proc = proc;
    executionState.step = 0;
    executionState.timer = 0;
    showExecutionModal();
    renderExecutionStep();
    startExecutionTimer();
}

function showExecutionModal() {
    document.getElementById('execution-modal').classList.remove('hidden');
    document.body.classList.add('overflow-hidden');
}

function hideExecutionModal() {
    document.getElementById('execution-modal').classList.add('hidden');
    document.body.classList.remove('overflow-hidden');
    stopExecutionTimer();
}

function renderExecutionStep() {
    const proc = executionState.proc;
    const stepIdx = executionState.step;
    const steps = proc.steps || [];
    const step = steps[stepIdx];
    document.getElementById('execution-title').textContent = `Executando: ${proc.title}`;
    document.getElementById('execution-progress-text').textContent = `${stepIdx+1}/${steps.length}`;
    document.getElementById('execution-progress-bar').style.width = `${((stepIdx+1)/steps.length)*100}%`;
    let html = '';
    if (step) {
        html += `<div class='font-semibold text-blue-700 dark:text-blue-300 mb-2'>Passo ${stepIdx+1}</div>`;
        html += `<div class='mb-2 text-gray-800 dark:text-gray-100'>${step.text ? step.text.replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''}</div>`;
        if (step.imageData) {
            html += `<img src='${step.imageData}' style='max-width:320px;max-height:200px;border-radius:0.5rem;cursor:pointer' onclick="expandStepImage('${encodeURIComponent(step.imageData)}')">`;
        }
    } else {
        html += `<div class='text-gray-500'>Sem passo definido.</div>`;
    }
    document.getElementById('execution-step-content').innerHTML = html;
    // Controla botões
    document.getElementById('execution-prev').disabled = stepIdx === 0;
    document.getElementById('execution-next').disabled = stepIdx === steps.length-1;
}

function nextExecutionStep() {
    if (!executionState.proc) return;
    if (executionState.step < (executionState.proc.steps.length-1)) {
        executionState.step++;
        renderExecutionStep();
    }
}

function prevExecutionStep() {
    if (!executionState.proc) return;
    if (executionState.step > 0) {
        executionState.step--;
        renderExecutionStep();
    }
}

function finishExecution() {
    stopExecutionTimer();
    alert('Execução finalizada! Tempo: ' + formatExecutionTime(executionState.timer));
    hideExecutionModal();
}
function startExecutionTimer() {
    stopExecutionTimer();
    executionState.timerInterval = setInterval(() => {
        executionState.timer++;
        updateExecutionTimerDisplay();
    }, 1000);
}

function stopExecutionTimer() {
    if (executionState.timerInterval) {
        clearInterval(executionState.timerInterval);
        executionState.timerInterval = null;
    }
}

function toggleExecutionTimer() {
    if (executionState.timerInterval) {
        stopExecutionTimer();
    } else {
        startExecutionTimer();
    }
}

function updateExecutionTimerDisplay() {
    document.getElementById('execution-timer').textContent = formatExecutionTime(executionState.timer);
}

function formatExecutionTime(sec) {
    const m = Math.floor(sec/60).toString().padStart(2,'0');
    const s = (sec%60).toString().padStart(2,'0');
    return `${m}:${s}`;
}

// Garante que modal fecha ao clicar no X ou fora
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('execution-modal');
    if (modal) {
        modal.addEventListener('click', e => {
            if (e.target === modal) hideExecutionModal();
        });
    }
});
// Função para renovar procedimento (atualiza created_at para agora)
async function renovarProcedimento(procId) {
    const proc = procedures.find(p => String(p.id) === String(procId));
    if (!proc) return;
    const novaData = new Date().toISOString();
    const { error } = await supabaseClient.from('procedures').update({ created_at: novaData }).eq('id', procId);
    if (error) {
        alert('Erro ao renovar procedimento: ' + error.message);
        return;
    }
    // alert('Procedimento renovado por mais 6 meses!');
    // Atualiza local e reabre modal
    proc.created_at = novaData;
    loadProcedures();
    openProcedureDetailsModal(procId);
}
// Abre modal de detalhes do procedimento
function openProcedureDetailsModal(procId) {
    const proc = procedures.find(p => String(p.id) === String(procId));
    if (!proc) return;
    const modal = document.getElementById('procedure-details-modal');
    const content = document.getElementById('procedure-details-content');
    if (!modal || !content) return;
    // Calcular vencimento e renovação
    let vencido = false;
    let renovacaoHtml = '';
    let dataVencimento = '-';
    if (proc.created_at) {
        const created = new Date(proc.created_at);
        const vencimento = new Date(created);
        vencimento.setMonth(vencimento.getMonth() + 6);
        dataVencimento = vencimento.toLocaleDateString('pt-BR');
        const now = new Date();
        if (now > vencimento) {
            vencido = true;
            renovacaoHtml = `<div class='bg-red-100 text-red-700 px-4 py-2 rounded mb-4 font-semibold flex items-center gap-2'><i class='fas fa-exclamation-triangle'></i> Procedimento vencido em <b>${dataVencimento}</b>! <button onclick=\"renovarProcedimento('${proc.id}')\" class='ml-4 bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded'>Renovar</button></div>`;
        } else {
            renovacaoHtml = `<div class='bg-green-100 text-green-700 px-4 py-2 rounded mb-4 font-semibold flex items-center gap-2'><i class='fas fa-check-circle'></i> Válido até <b>${dataVencimento}</b></div>`;
        }
    }
    content.innerHTML = `
        <h2 class="text-2xl font-bold mb-2 text-blue-700 dark:text-blue-300">${proc.title}</h2>
        <div class="text-gray-600 dark:text-gray-300 mb-2">${proc.description || ''}</div>
        <div class="text-sm text-gray-400 mb-2">Criado em: ${proc.created_at ? formatDate(proc.created_at) : '-'}</div>
        <div class="text-sm text-gray-400 mb-2">Vencimento: ${dataVencimento}</div>
    <div class="text-sm text-gray-400 mb-4">Autor: ${proc.display_name || '-'}</div>
        ${renovacaoHtml}
        <div class="mb-4">
            <h4 class="font-semibold mb-2 text-blue-600 dark:text-blue-400">Passos</h4>
            <div class="flex flex-col gap-3">
                ${(proc.steps||[]).map((step, idx) => `
                    <div class='flex flex-col gap-1 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700'>
                        <div class='font-medium text-blue-700 dark:text-blue-300 mb-1'>Passo ${idx+1}</div>
                        <div class='text-gray-800 dark:text-gray-100 text-sm mb-1'>${step.text ? step.text.replace(/</g,'&lt;').replace(/>/g,'&gt;') : ''}</div>
                        ${step.imageData ? `<img src='${step.imageData}' style='max-width:180px;max-height:120px;border-radius:0.5rem;margin-top:4px;cursor:pointer' onclick=\"expandStepImage('${encodeURIComponent(step.imageData)}')\">` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
        <div class="flex gap-2 mt-4">
            <button onclick="editProcedure('${proc.id}')" class="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-gray-600">Editar</button>
            <button onclick="duplicateProcedure('${proc.id}')" class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">Duplicar</button>
            <button onclick="startProcedureExecution('${proc.id}')" class="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">Iniciar</button>
        </div>
    `;
    modal.classList.remove('hidden');
}

function closeProcedureDetailsModal() {
    const modal = document.getElementById('procedure-details-modal');
    if (modal) modal.classList.add('hidden');
}

function expandStepImage(imgData) {
    // Abre imagem em nova aba
    window.open(decodeURIComponent(imgData), '_blank');
}
// --- Modal de visualização de imagem de passo ---
function expandStepImage(imageDataEncoded) {
    const imageData = decodeURIComponent(imageDataEncoded);
    let modal = document.getElementById('step-image-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'step-image-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-80 z-[9999] flex items-center justify-center';
        modal.innerHTML = `
            <div class="relative">
                <img id="step-image-modal-img" src="" class="max-w-[90vw] max-h-[80vh] rounded-xl shadow-2xl border-4 border-white" />
                <button onclick="closeStepImageModal()" class="absolute top-2 right-2 text-white text-3xl bg-black bg-opacity-40 rounded-full px-3 py-1 hover:bg-opacity-70 transition"><i class="fas fa-times"></i></button>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', function(e) {
            if (e.target === modal) closeStepImageModal();
        });
    }
    document.getElementById('step-image-modal-img').src = imageData;
    modal.classList.remove('hidden');
}

function closeStepImageModal() {
    const modal = document.getElementById('step-image-modal');
    if (modal) modal.classList.add('hidden');
}
// Função para salvar procedimento (placeholder)
async function saveProcedure() {
    console.log('saveProcedure chamada');
    const titleInput = document.getElementById('procedure-title');
    const descInput = document.getElementById('procedure-description');
    const stepsContainer = document.getElementById('procedure-steps-list');
    if (!stepsContainer || !titleInput) { console.log('stepsContainer ou titleInput não encontrado'); return; }
    const name = titleInput.value.trim();
    const description = descInput ? descInput.value.trim() : '';
    const steps = Array.from(stepsContainer.querySelectorAll('.procedure-step')).map(stepDiv => {
        const text = stepDiv.querySelector('.procedure-step-text').value.trim();
        let imageData = null;
        const img = stepDiv.querySelector('img');
        if (img && img.src) imageData = img.src;
        return { text, imageData };
    });
    // Pega o display name do Supabase (user_metadata.name ou name ou email)
    const display_name = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.name)
        ? window.currentUser.user_metadata.name
        : (window.currentUser && (window.currentUser.name || window.currentUser.email)) || 'Usuário';
    const user_id = window.currentUser ? window.currentUser.id : null;
    console.log('Dados para salvar:', {name, description, steps, user_id, display_name});
    if (!name) {
        alert('Preencha o título do procedimento!');
        return;
    }
    // Corrige: define modal e editId antes do uso
    const modal = document.getElementById('procedure-modal');
    const editId = modal ? modal.getAttribute('data-edit-id') : null;
    let actionType = editId ? 'edit' : 'create';
    let activityDescription = editId ? `Procedimento editado: ${name}` : `Novo procedimento criado: ${name}`;
    try {
        await supabaseClient.from('activities').insert([{
            type: 'procedure',
            description: activityDescription,
            user_id,
            display_name,
            action: actionType,
            group_id: window.currentGroupId,
            timestamp: new Date().toISOString()
        }]);
    } catch (e) {
        console.error('Erro ao registrar atividade:', e);
    }
    let error = null;
    if (editId) {
        // Atualiza procedimento existente
        const updateData = {
            title: name,
            description,
            steps,
            user_id,
            display_name,
            group_id: window.currentGroupId
        };
        ({ error } = await supabaseClient.from('procedures').update(updateData).eq('id', editId));
    } else {
        // Cria novo procedimento
        const newProcedure = {
            title: name,
            description,
            steps,
            user_id,
            display_name,
            group_id: window.currentGroupId,
            created_at: new Date().toISOString()
        };
        ({ error } = await supabaseClient.from('procedures').insert([newProcedure]));
    }
    if (error) {
        alert('Erro ao salvar procedimento: ' + error.message);
        return;
    }
    // alert('Procedimento salvo com sucesso!');
    // Fechar modal
    closeProcedureModal();
    // Limpar campos e id de edição
    titleInput.value = '';
    if (descInput) descInput.value = '';
    stepsContainer.innerHTML = '';
    if (modal) modal.removeAttribute('data-edit-id');
    // Atualizar lista de procedimentos
    loadProcedures();
    
}

function closeProcedureModal() {
    const modal = document.getElementById('procedure-modal');
    if (modal) modal.classList.add('hidden');
}
// Função para adicionar um passo ao procedimento
function addProcedureStep(text = '', imageData = '') {
    const stepsContainer = document.getElementById('procedure-steps-list');
    if (!stepsContainer) return;
    const stepIndex = stepsContainer.children.length;
    const stepDiv = document.createElement('div');
    stepDiv.className = 'procedure-step flex flex-col gap-2 p-4 mb-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 relative';
    stepDiv.innerHTML = `
        <textarea class="procedure-step-text w-full p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm resize-vertical" placeholder="Descreva o passo..." rows="2"></textarea>
        <div class="procedure-step-image-drop flex items-center justify-center min-h-[80px] bg-gray-100 dark:bg-gray-700 rounded border-2 border-dashed border-gray-300 dark:border-gray-500 cursor-pointer text-gray-400 dark:text-gray-300 text-sm"
            ondragover="event.preventDefault();this.classList.add('ring-2','ring-blue-400')" 
            ondragleave="this.classList.remove('ring-2','ring-blue-400')" 
            ondrop="handleStepImageDrop(event, this)">
            Arraste uma imagem aqui ou clique para selecionar
            <input type="file" accept="image/*" style="display:none" onchange="handleStepImageInput(event, this)">
        </div>
        <button type="button" onclick="removeProcedureStep(this)" class="absolute top-2 right-2 text-red-500 hover:text-red-700"><i class="fas fa-trash"></i></button>
    `;
    // Preencher texto se fornecido
    const textarea = stepDiv.querySelector('.procedure-step-text');
    if (textarea && text) textarea.value = text;
    // Preencher imagem se fornecida
    if (imageData) {
        const dropArea = stepDiv.querySelector('.procedure-step-image-drop');
        if (dropArea) {
            // Remove previews anteriores se houver
            dropArea.innerHTML = '';
            // Adiciona imagem
            const img = document.createElement('img');
            img.src = imageData;
            img.style.maxWidth = '180px';
            img.style.maxHeight = '120px';
            img.style.borderRadius = '0.5rem';
            img.style.marginTop = '4px';
            img.style.cursor = 'pointer';
            img.onclick = function() { expandStepImage(encodeURIComponent(imageData)); };
            dropArea.appendChild(img);
            // Re-adiciona input file para permitir troca
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.style.display = 'none';
            input.onchange = function(e) { handleStepImageInput(e, input); };
            dropArea.appendChild(input);
            // Clique na área de drop abre o input
            dropArea.addEventListener('click', function(e) {
                if (e.target.tagName !== 'INPUT') {
                    input.click();
                }
            });
        }
    } else {
        // Clique na área de drop abre o input (caso padrão)
        const dropArea = stepDiv.querySelector('.procedure-step-image-drop');
        dropArea.addEventListener('click', function(e) {
            if (e.target.tagName !== 'INPUT') {
                dropArea.querySelector('input[type=file]').click();
            }
        });
    }
    stepsContainer.appendChild(stepDiv);
}

// Remove passo
function removeProcedureStep(btn) {
    const stepDiv = btn.closest('.procedure-step');
    if (stepDiv) stepDiv.remove();
}

// Lida com drop de imagem
function handleStepImageDrop(event, dropArea) {
    event.preventDefault();
    dropArea.classList.remove('ring-2','ring-blue-400');
    const files = event.dataTransfer.files;
    if (files && files[0] && files[0].type.startsWith('image/')) {
        showStepImagePreview(dropArea, files[0]);
    }
}

// Lida com input de imagem
function handleStepImageInput(event, input) {
    const file = input.files[0];
    if (file && file.type.startsWith('image/')) {
        showStepImagePreview(input.parentElement, file);
    }
}

// Mostra preview da imagem no passo
function showStepImagePreview(dropArea, file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        let img = dropArea.querySelector('img');
        if (!img) {
            img = document.createElement('img');
            img.style.maxWidth = '100%';
            img.style.maxHeight = '120px';
            img.style.marginTop = '8px';
            dropArea.appendChild(img);
        }
        img.src = e.target.result;
        dropArea.classList.add('has-image');
    };
    reader.readAsDataURL(file);
}
// Função para abrir o modal de novo procedimento (placeholder)
function openProcedureModal() {
    const modal = document.getElementById('procedure-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

// Função utilitária para formatar datas no padrão brasileiro
function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR');
}
// Função para login
async function login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-pass').value;
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
        document.getElementById('auth-error').textContent = 'Erro: ' + error.message + (error.status ? ' (status ' + error.status + ')' : '');
        console.error('Supabase login error:', error);
    } else {
        document.body.innerHTML = originalBodyHtml;
        initializeTheme();
        const { data: { user } } = await supabaseClient.auth.getUser();
        window.currentUser = user;
        showUserInfoBar(user);
        showSidebarUserInfo(user);
        showModule('dashboard');
        updateDashboardCounts();
        loadRecentActivity();
        setupEventListeners();
    }
}
    // Alterna para formulário de login
    function showLoginForm() {
        document.getElementById('login-form').style.display = '';
        document.getElementById('signup-form').style.display = 'none';
        document.getElementById('auth-modal-title').textContent = 'Entrar no SGE';
        document.getElementById('auth-error').textContent = '';
    }
function showLoginForm() {
    document.getElementById('login-form').style.display = '';
    document.getElementById('signup-form').style.display = 'none';
    document.getElementById('auth-modal-title').textContent = 'Entrar no SGE';
    document.getElementById('auth-error').textContent = '';
}

// Global variables
let currentModule = 'dashboard';
let currentTheme = localStorage.getItem('theme') || 'light';
let editingMessageId = null;
let editingServiceId = null;
let editingProcedureId = null;
let executingProcedure = null;
let executionCurrentStep = 0;
let executionTimer = null;
let executionStartTime = null;
let executionPaused = false;
let draggedElement = null;
let draggedMessageId = null;
let copyTimeout = null;
let servicePage = 1;
const servicesPerPage = 15;
let activityPage = 1;
const activitiesPerPage = 5;

// Data storage
let messages = [];
let services = [];
let procedures = [];


// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initializeTheme();
    showModule('dashboard');
    updateDashboardCounts();
    loadRecentActivity();
    setupEventListeners();
    setupRealtimeActivities();

    // Força reload da página ao clicar em Dashboard (sidebar e mobile)
    const dashboardNav = document.querySelector('.nav-item[onclick*="showModule(\'dashboard\')"]');
    if (dashboardNav) {
        dashboardNav.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.reload();
        });
    }
    const dashboardMobileNav = document.querySelector('.mobile-nav-item[onclick*="showModule(\'dashboard\')"]');
    if (dashboardMobileNav) {
        dashboardMobileNav.addEventListener('click', function(e) {
            e.preventDefault();
            window.location.reload();
        });
    }
});

// Checa usuário logado ao carregar
document.addEventListener('DOMContentLoaded', async function() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        showAuthModal();
        showSidebarUserInfo(null);
    } else {
        window.currentUser = user;
        showUserInfoBar(user);
        showSidebarUserInfo(user);
        // Carregue dados normalmente
        showModule('dashboard');
        updateDashboardCounts();
        loadRecentActivity();
        setupEventListeners();
    setupRealtimeActivities();
    }
});

// Exibe modal de login/cadastro
let originalBodyHtml = '';
function showAuthModal() {
    if (!originalBodyHtml) originalBodyHtml = document.body.innerHTML;
    document.body.innerHTML = `
    <div class="fixed inset-0 flex items-center justify-center bg-black bg-opacity-60 z-50">
        <div class="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-sm w-full shadow-lg" id="auth-modal-box">
            <h2 class="text-2xl font-bold mb-4 text-blue-600 dark:text-blue-400" id="auth-modal-title">Entrar no SGE</h2>
            <div id="login-form">
                <input id="login-email" type="email" placeholder="E-mail" class="w-full mb-3 px-4 py-2 border rounded-lg" autocomplete="email">
                <input id="login-pass" type="password" placeholder="Senha" class="w-full mb-4 px-4 py-2 border rounded-lg" autocomplete="current-password">
                <button onclick="login()" class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg mb-2">Entrar</button>
                <button onclick="showSignupForm()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg">Cadastrar</button>
            </div>
            <div id="signup-form" style="display:none;">
                <input id="signup-name" type="text" placeholder="Nome" class="w-full mb-3 px-4 py-2 border rounded-lg" autocomplete="name">
                <input id="signup-email" type="email" placeholder="E-mail" class="w-full mb-3 px-4 py-2 border rounded-lg" autocomplete="email">
                <input id="signup-pass" type="password" placeholder="Senha" class="w-full mb-4 px-4 py-2 border rounded-lg" autocomplete="new-password">
                <button onclick="signup()" class="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg mb-2">Cadastrar</button>
                <button onclick="showLoginForm()" class="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg">Voltar</button>
            </div>
            <div id="auth-error" class="text-red-600 mt-2"></div>
        </div>
    </div>`;
}

function loadProcedures() {
    // Carrega procedimentos do Supabase e exibe na lista
    supabaseClient
        .from('procedures')
        .select('*')
        .eq('group_id', window.currentGroupId)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
            if (error) {
                console.error('Erro ao carregar procedimentos:', error.message);
                procedures = [];
            } else {
                procedures = data || [];
            }
            const container = document.getElementById('procedures-grid');
            if (!container) return;
            if (procedures.length === 0) {
                container.innerHTML = '<div class="col-span-full text-center py-12"><p class="text-gray-500 dark:text-gray-400">Nenhum procedimento cadastrado</p></div>';
                return;
            }
            container.innerHTML = procedures.map(proc => {
                const isAdmin = window.currentUser && (window.currentUser.role === 'admin' || window.currentUser.email === 'ericdudu1999@gmail.com');
                return `
                <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm card-hover mb-4 cursor-pointer" onclick="openProcedureDetailsModal('${proc.id}')">
                    <div class="flex items-center justify-between mb-2">
                        <h3 class="font-semibold text-lg">${proc.title}</h3>
                    </div>
                    <div class="text-gray-600 dark:text-gray-400 text-sm mb-4">${proc.description || ''}</div>
                    <div class="flex gap-2 mt-2">
                        <button onclick="event.stopPropagation(); duplicateProcedure('${proc.id}')" title="Duplicar" class="px-3 py-2 text-blue-600 hover:text-blue-700 border border-blue-300 rounded text-sm"><i class="fas fa-clone"></i></button>
                        <button onclick="event.stopPropagation(); startProcedureExecution('${proc.id}')" title="Iniciar" class="px-3 py-2 text-green-600 hover:text-green-700 border border-green-300 rounded text-sm"><i class="fas fa-play"></i></button>
                        <button onclick="event.stopPropagation(); editProcedure('${proc.id}')" title="Editar" class="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded text-sm"><i class="fas fa-edit"></i></button>
                        ${isAdmin ? `<button onclick=\"event.stopPropagation(); deleteProcedure('${proc.id}')\" title=\"Excluir\" class=\"px-3 py-2 text-red-600 hover:text-red-700 border border-red-300 rounded text-sm\"><i class=\"fas fa-trash\"></i></button>` : ''}
                    </div>
                </div>
                `;
            }).join('');
        });
}


// Alterna para formulário de cadastro
function showSignupForm() {
    document.getElementById('login-form').style.display = 'none';
    document.getElementById('signup-form').style.display = '';
    document.getElementById('auth-modal-title').textContent = 'Cadastrar no SGE';
    document.getElementById('auth-error').textContent = '';
}

async function signup() {
    const name = document.getElementById('signup-name').value.trim();
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-pass').value;
    if (!name) {
        document.getElementById('auth-error').textContent = 'Por favor, preencha seu nome.';
        return;
    }
    // Garante que o display name será salvo no user_metadata do Supabase
    const { error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            data: {
                name: name,
                full_name: name,
                display_name: name
            }
        }
    });
    if (error) {
        document.getElementById('auth-error').textContent = error.message;
    } else {
        document.getElementById('auth-error').textContent = 'Cadastro realizado! Verifique seu e-mail.';
    }
}

// Função para logout
async function logout() {
    await supabaseClient.auth.signOut();
    showSidebarUserInfo(null);
    showAuthModal();
}

// Exibe barra de usuário logado (topo)
function showUserInfoBar(user) {
    // Função mantida para compatibilidade, mas não faz nada
}

function initializeTheme() {
    const html = document.documentElement;
    const body = document.body;
    if (!html || !body) return;
    const themeIcon = document.getElementById('theme-icon');
    const themeText = document.getElementById('theme-text');
    const mobileThemeIcon = document.getElementById('mobile-theme-icon');
    if (currentTheme === 'dark') {
        html.classList.add('dark');
        body.classList.add('dark');
        if (themeIcon) themeIcon.className = 'fas fa-sun mr-2';
        if (themeText) themeText.textContent = 'Modo Claro';
        if (mobileThemeIcon) mobileThemeIcon.className = 'fas fa-sun';
    } else {
        html.classList.remove('dark');
        body.classList.remove('dark');
        if (themeIcon) themeIcon.className = 'fas fa-moon mr-2';
        if (themeText) themeText.textContent = 'Modo Escuro';
        if (mobileThemeIcon) mobileThemeIcon.className = 'fas fa-moon';
    }
}
        

// Exibe/esconde o botão de logout no mobile conforme login
function updateMobileLogoutBtn(user) {
    const btn = document.getElementById('mobile-logout-btn');
    if (!btn) return;
    if (user) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

// Exibe info do usuário na barra inferior lateral (apenas nome)
function showSidebarUserInfo(user) {
    const sidebarUserName = document.getElementById('sidebar-user-name');
    if (!sidebarUserName) return;
    if (user) {
        let nome = (user.user_metadata && user.user_metadata.name) ? user.user_metadata.name : (user.name || user.email || 'Usuário');
        sidebarUserName.textContent = nome;
    } else {
        sidebarUserName.textContent = '';
    }
    updateMobileLogoutBtn(user);
}

// Menu de configurações lateral
document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('sidebar-settings-btn');
    const menu = document.getElementById('sidebar-settings-menu');
    if (btn && menu) {
        btn.onclick = function(e) {
            e.stopPropagation();
            menu.classList.toggle('hidden');
        };
        document.addEventListener('click', function(e) {
            if (!menu.classList.contains('hidden')) menu.classList.add('hidden');
        });
        menu.onclick = function(e) { e.stopPropagation(); };
    }
});

function closeSidebarSettingsMenu() {
    const menu = document.getElementById('sidebar-settings-menu');
    if (menu) menu.classList.add('hidden');
}

// Atualiza ícone/texto do tema no menu lateral
function updateSidebarThemeIcon() {
    const icon = document.getElementById('sidebar-theme-icon');
    const text = document.getElementById('sidebar-theme-text');
    if (!icon || !text) return;
    if (currentTheme === 'dark') {
        icon.className = 'fas fa-sun';
        text.textContent = 'Modo Claro';
    } else {
        icon.className = 'fas fa-moon';
        text.textContent = 'Modo Escuro';
    }
}

// Chamar updateSidebarThemeIcon sempre que o tema mudar
const _oldToggleTheme = window.toggleTheme;
window.toggleTheme = function() {
    _oldToggleTheme();
    updateSidebarThemeIcon();
};
document.addEventListener('DOMContentLoaded', updateSidebarThemeIcon);
        

function showConfirmModal(message, onConfirm, onCancel) {
    const modal = document.getElementById('confirm-modal');
    document.getElementById('confirm-modal-message').textContent = message || 'Tem certeza?';
    modal.classList.remove('hidden');
    // Remove todos os listeners antigos
    const okBtn = document.getElementById('confirm-modal-ok');
    const cancelBtn = document.getElementById('confirm-modal-cancel');

    okBtn.replaceWith(okBtn.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));

    const okBtnNew = document.getElementById('confirm-modal-ok');
    const cancelBtnNew = document.getElementById('confirm-modal-cancel');

    okBtnNew.onclick = () => {
        modal.classList.add('hidden');
        if (typeof onConfirm === 'function') onConfirm();
    };
    cancelBtnNew.onclick = () => {
        modal.classList.add('hidden');
        if (typeof onCancel === 'function') onCancel();
    };
    modal.onclick = (e) => { if (e.target === modal) modal.classList.add('hidden'); };
}

function toggleTheme() {
    currentTheme = currentTheme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', currentTheme);
    
    const html = document.documentElement;
    const body = document.body;
    
    if (currentTheme === 'dark') {
        html.classList.add('dark');
        body.classList.add('dark');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) themeIcon.className = 'fas fa-sun mr-2';
        const themeText = document.getElementById('theme-text');
        if (themeText) themeText.textContent = 'Modo Claro';
        const mobileThemeIcon = document.getElementById('mobile-theme-icon');
        if (mobileThemeIcon) mobileThemeIcon.className = 'fas fa-sun';
    } else {
        html.classList.remove('dark');
        body.classList.remove('dark');
        const themeIcon = document.getElementById('theme-icon');
        if (themeIcon) themeIcon.className = 'fas fa-moon mr-2';
        const themeText = document.getElementById('theme-text');
        if (themeText) themeText.textContent = 'Modo Escuro';
        const mobileThemeIcon = document.getElementById('mobile-theme-icon');
        if (mobileThemeIcon) mobileThemeIcon.className = 'fas fa-moon';
    }
    
    // Force re-render of charts with new theme
    setTimeout(() => {
        if (currentModule === 'dashboard') {
            loadUsageChart();
        }
        if (currentModule === 'services') {
            loadServicesChart();
        }
    }, 100);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('-translate-x-full');
}

function showModule(moduleName) {
    // Hide all modules
    document.querySelectorAll('.module').forEach(module => {
        module.classList.add('hidden');
    });
    
    // Show selected module
    document.getElementById(moduleName + '-module').classList.remove('hidden');
    document.getElementById(moduleName + '-module').classList.add('fade-in');
    
    // Update navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('bg-blue-50', 'dark:bg-gray-700', 'text-blue-600', 'dark:text-blue-400');
    });
    
    document.querySelectorAll('.mobile-nav-item').forEach(item => {
        item.classList.remove('text-blue-600', 'dark:text-blue-400');
        item.classList.add('text-gray-600', 'dark:text-gray-400');
    });
    
    // Highlight active navigation
    const activeNavItem = document.querySelector(`[onclick="showModule('${moduleName}')"]`);
    if (activeNavItem) {
        if (activeNavItem.classList.contains('nav-item')) {
            activeNavItem.classList.add('bg-blue-50', 'dark:bg-gray-700', 'text-blue-600', 'dark:text-blue-400');
        } else if (activeNavItem.classList.contains('mobile-nav-item')) {
            activeNavItem.classList.remove('text-gray-600', 'dark:text-gray-400');
            activeNavItem.classList.add('text-blue-600', 'dark:text-blue-400');
        }
    }
    
    currentModule = moduleName;
    
    // Load module content
    switch(moduleName) {
        case 'dashboard':
            // Sempre recarrega dados ao clicar em Dashboard
            loadDashboard();
            break;
        case 'messages':
            loadMessages();
            break;
        case 'services':
            loadServices();
            break;
        case 'procedures':
            loadProcedures();
            break;
        case 'favorites':
            loadFavorites();
            break;
    }
    
    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.add('-translate-x-full');
    }
}

function setupEventListeners() {
    // Search and filter listeners
    document.getElementById('message-search').addEventListener('input', loadMessages);
    document.getElementById('message-sort').addEventListener('change', loadMessages);
    document.getElementById('procedure-search').addEventListener('input', loadProcedures);
    document.getElementById('procedure-filter').addEventListener('change', loadProcedures);
}






async function loadDashboard() {
    // Carrega todos os dados do banco antes de atualizar contadores e gráfico
    // Mensagens
    try {
        const { data: msgData, error: msgError } = await supabaseClient
            .from('messages')
            .select('*');
        messages = msgError ? [] : (msgData || []);
    } catch (e) { messages = []; }
    // Serviços
    try {
        const { data: srvData, error: srvError } = await supabaseClient
            .from('services')
            .select('*');
        services = srvError ? [] : (srvData || []);
    } catch (e) { services = []; }
    // Procedimentos
    try {
        const { data: procData, error: procError } = await supabaseClient
            .from('procedures')
            .select('*')
            .eq('group_id', window.currentGroupId);
        procedures = procError ? [] : (procData || []);
    } catch (e) { procedures = []; }
    updateDashboardCounts();
    loadUsageChart();
}

function updateDashboardCounts() {
    document.getElementById('messages-count').textContent = messages.length;
    document.getElementById('services-count').textContent = services.length;
    document.getElementById('procedures-count').textContent = procedures.length;
    document.getElementById('favorites-count').textContent = procedures.filter(p => p.favorite).length;
}

async function loadRecentActivity() {
    const container = document.getElementById('recent-activity');
    if (!container) return;

    // Fetch activities from Supabase, order by timestamp desc, paginate
    const { data: activities, error } = await supabaseClient
        .from('activities')
        .select('*')
        .eq('group_id', window.currentGroupId)
        .order('timestamp', { ascending: false });

    if (error || !activities) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">Erro ao carregar atividades recentes</p>';
        return;
    }

    const totalActivities = activities.length;
    const totalPages = Math.max(1, Math.ceil(totalActivities / activitiesPerPage));
    if (activityPage > totalPages) activityPage = totalPages;
    if (activityPage < 1) activityPage = 1;
    const start = (activityPage - 1) * activitiesPerPage;
    const end = start + activitiesPerPage;
    const pageActivities = activities.slice(start, end);

    // Botão e título na mesma linha
    let header = `<div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold m-0">Atividade Recente</h3>
        <button onclick="openAllActivitiesModal()" class="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm">Ver todas as atividades</button>
    </div>`;

    if (pageActivities.length === 0) {
        container.innerHTML = header + '<p class="text-gray-500 dark:text-gray-400 text-center py-8">Nenhuma atividade recente</p>';
        return;
    }

    container.innerHTML = header + pageActivities.map(activity => {
    
// Modal de todas as atividades
function openAllActivitiesModal() {
    // Cria modal se não existir
    let modal = document.getElementById('all-activities-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'all-activities-modal';
        modal.className = 'fixed inset-0 bg-black bg-opacity-60 z-[9999] flex items-center justify-center';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-2xl w-full shadow-lg relative max-h-[90vh] overflow-y-auto">
                <button onclick="closeAllActivitiesModal()" class="absolute top-2 right-2 text-gray-500 hover:text-red-600 text-2xl">&times;</button>
                <h2 class="text-2xl font-bold mb-4 text-blue-700 dark:text-blue-300">Todas as Atividades</h2>
                <div id="all-activities-list" class="space-y-3"></div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    // Carrega todas as atividades do banco
    supabaseClient
        .from('activities')
        .select('*')
        .eq('group_id', window.currentGroupId)
        .order('timestamp', { ascending: false })
        .then(({ data, error }) => {
            const list = document.getElementById('all-activities-list');
            if (error || !data) {
                list.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">Erro ao carregar atividades</p>';
                return;
            }
            if (data.length === 0) {
                list.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-8">Nenhuma atividade encontrada</p>';
                return;
            }
            list.innerHTML = data.map(activity => {
                let userInfo = '';
                if (activity.display_name) {
                    userInfo = `<span class=\"ml-2 text-xs text-blue-700 dark:text-blue-300 font-semibold\">por ${activity.display_name}</span>`;
                }
                return `<div class=\"flex items-center gap-2\"><i class=\"fas fa-${getActivityIcon(activity.type)} text-gray-400\"></i> <span>${activity.description || ''}</span> ${userInfo} <span class=\"ml-auto text-xs text-gray-400\">${formatDate(activity.timestamp)}</span></div>`;
            }).join('');
        });
    modal.classList.remove('hidden');
}

function closeAllActivitiesModal() {
    const modal = document.getElementById('all-activities-modal');
    if (modal) modal.classList.add('hidden');
}
        // Só mostra display_name para atividades do tipo 'procedure'
        let userInfo = '';
        if (activity.type === 'procedure') {
            let displayName = activity.display_name || activity.author || activity.user_name || 'Usuário';
            // Checa se é admin
            let isAdmin = false;
            if (activity.user_id && window.currentUser) {
                // Se o id do usuário da atividade for igual ao do admin conhecido
                if (activity.user_id === window.currentUser.id && (window.currentUser.role === 'admin' || window.currentUser.email === 'ericdudu1999@gmail.com')) {
                    isAdmin = true;
                }
            }
            // Alternativamente, se o display_name for igual ao do admin conhecido
            if (!isAdmin && displayName && displayName.toLowerCase().includes('eric oliveira')) {
                isAdmin = true;
            }
            if (isAdmin) {
                displayName += ' (ADM)';
            }
            userInfo = `<span class=\"ml-2 text-xs text-blue-700 dark:text-blue-300 font-semibold\">por ${displayName}</span>`;
        }
        return `
        <div class=\"flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg\">
            <div class=\"p-2 bg-blue-100 dark:bg-blue-900 rounded-lg mr-3\">
                <i class=\"fas fa-${getActivityIcon(activity.type)} text-blue-600 dark:text-blue-400 text-sm\"></i>
            </div>
            <div class=\"flex-1\">
                <p class=\"text-sm font-medium\">${activity.description} ${userInfo}</p>
                <p class=\"text-xs text-gray-500 dark:text-gray-400\">${formatDate(activity.timestamp)}</p>
            </div>
        </div>
        `;
    }).join('');

    // Paginação
    if (totalPages > 1) {
        container.innerHTML += `
            <div class="flex justify-center gap-2 mt-4">
                <button onclick="activityPage--;loadRecentActivity()" ${activityPage === 1 ? 'disabled' : ''} class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm">Anterior</button>
                <span class="px-2 py-1">${activityPage} / ${totalPages}</span>
                <button onclick="activityPage++;loadRecentActivity()" ${activityPage === totalPages ? 'disabled' : ''} class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm">Próxima</button>
            </div>
        `;
    }
}

function getActivityIcon(type) {
    const icons = {
        message: 'message',
        service: 'cogs',
        procedure: 'list-check',
        favorite: 'star'
    };
    return icons[type] || 'info';
}

function loadUsageChart() {
    const canvas = document.getElementById('usage-chart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    Chart.getChart(canvas)?.destroy();

    // Paleta clean e acessível para ambos temas
    const colors = [
        currentTheme === 'dark' ? '#60a5fa' : '#2563eb',   // Azul
        currentTheme === 'dark' ? '#34d399' : '#059669',   // Verde
        currentTheme === 'dark' ? '#a78bfa' : '#7c3aed',   // Roxo
        currentTheme === 'dark' ? '#fbbf24' : '#f59e0b'    // Amarelo
    ];

    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Mensagens', 'Serviços', 'Procedimentos', 'Favoritos'],
            datasets: [{
                data: [
                    messages.length,
                    services.length,
                    procedures.length,
                    procedures.filter(p => p.favorite).length
                ],
                backgroundColor: colors,
                borderWidth: 0,
                hoverOffset: 12
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%', // Donut clean, espessura média
            layout: { padding: 0 },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: currentTheme === 'dark' ? '#e5e7eb' : '#1e293b',
                        font: { size: 16, weight: 'medium', family: 'Inter, sans-serif' },
                        padding: 18,
                        boxWidth: 18,
                        boxHeight: 18,
                        usePointStyle: true,
                        pointStyle: 'circle'
                    }
                },
                tooltip: {
                    enabled: true,
                    backgroundColor: currentTheme === 'dark' ? '#1e293b' : '#fff',
                    titleColor: currentTheme === 'dark' ? '#fff' : '#2563eb',
                    bodyColor: currentTheme === 'dark' ? '#fff' : '#374151',
                    borderColor: currentTheme === 'dark' ? '#334155' : '#dbeafe',
                    borderWidth: 1,
                    padding: 12,
                    caretSize: 6,
                    cornerRadius: 8,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const value = context.parsed;
                            const percent = total ? Math.round((value / total) * 100) : 0;
                            return `${context.label}: ${value} (${percent}%)`;
                        }
                    }
                },
                datalabels: {
                    display: false // Nenhuma label sobre o gráfico
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true
            }
        }
    });
}

// Messages Module
async function loadMessages() {
    // Busca mensagens do Supabase
    const { data, error } = await supabaseClient
        .from('messages')
        .select('*')
        .order('order', { ascending: true });

    // Garante que cada mensagem tem um campo 'order' válido
    if (messages && messages.length > 0) {
        let needsUpdate = false;
        messages.forEach((msg, idx) => {
            if (msg.order !== idx) {
                msg.order = idx;
                supabaseClient
                    .from('messages')
                    .update({ order: idx })
                    .eq('id', msg.id);
                needsUpdate = true;
            }
        });
        if (needsUpdate) {
            // Recarrega após atualização
            setTimeout(() => loadMessages(), 500);
            return;
        }
    }
    if (error) {
        console.error('Erro ao carregar mensagens:', error.message);
        messages = [];
    } else {
        messages = data || [];
    }

    const searchTerm = document.getElementById('message-search').value.toLowerCase();
    const sortBy = document.getElementById('message-sort').value;

    let filteredMessages;
    if (!searchTerm && sortBy === 'recent') {
        filteredMessages = messages.slice();
    } else {
        filteredMessages = messages.filter(message => 
            (message.title || '').toLowerCase().includes(searchTerm) ||
            (message.content || '').toLowerCase().includes(searchTerm) ||
            (Array.isArray(message.tags) ? message.tags : []).some(tag => tag.toLowerCase().includes(searchTerm))
        );
        filteredMessages.sort((a, b) => {
            switch(sortBy) {
                case 'pinned':
                    return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
                case 'used':
                    return (b.usageCount || 0) - (a.usageCount || 0);
                case 'alphabetic':
                    return (a.title || '').localeCompare(b.title || '');
                default:
                    return new Date(b.createdAt) - new Date(a.createdAt);
            }
        });
    }

    const container = document.getElementById('messages-grid');
    if (filteredMessages.length === 0) {
        container.innerHTML = '<div class="col-span-full text-center py-12"><p class="text-gray-500 dark:text-gray-400">Nenhuma mensagem encontrada</p></div>';
        return;
    }
    container.innerHTML = filteredMessages.map(message => {
        // Sanitiza o conteúdo da mensagem para evitar erros de token
        const safeContent = String(message.content)
          .replace(/[\u0000-\u001F\u007F]/g, '') // remove caracteres de controle
          .replace(/</g, '&lt;') // escapa tags HTML
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
        return `
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-sm card-hover cursor-pointer message-card" 
                data-message-id="${message.id}" 
                draggable="true" 
                ondragstart="handleDragStart(event)" 
                ondragover="handleDragOver(event)" 
                ondrop="handleDrop(event)"
                onclick="copyMessage('${message.id}')"
                style="user-select:none"
            >
            <div class="flex items-start justify-between mb-3">
                <h3 class="font-semibold text-lg">${String(message.title)
                    .replace(/[\u0000-\u001F\u007F]/g, '')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;')}</h3>
                <div class="flex items-center gap-2">
                    <button onclick="toggleMessagePin('${message.id}'); event.stopPropagation();" class="text-${message.pinned ? 'yellow-500' : 'gray-400'} hover:text-yellow-500 transition-colors">
                        <i class="fas fa-thumbtack"></i>
                    </button>
                </div>
            </div>
            <p class="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-3">${safeContent}</p>
            <div class="flex flex-wrap gap-1 mb-4">
                ${(Array.isArray(message.tags) ? message.tags : []).map(tag => `<span class='px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-xs rounded-full'>${tag}</span>`).join('')}
            </div>
            <div class="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                <span>${formatDate(message.created_at)}</span>
            </div>
            <div class="flex gap-2">
                <button onclick="editMessage('${message.id}'); event.stopPropagation();" class="px-3 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded text-sm">
                    <i class="fas fa-edit"></i>
                </button>
                <button onclick="duplicateMessage('${message.id}'); event.stopPropagation();" class="px-3 py-2 text-blue-600 hover:text-blue-700 border border-blue-300 rounded text-sm">
                    <i class="fas fa-clone"></i>
                </button>
                <button onclick="deleteMessage('${message.id}'); event.stopPropagation();" class="px-3 py-2 text-red-600 hover:text-red-700 border border-red-300 rounded text-sm">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        </div>
        `;
    }).join('');
}

function openMessageModal() {
    document.getElementById('message-modal').classList.remove('hidden');
}

function saveMessage() {
    const title = document.getElementById('message-title').value.trim();
    const content = document.getElementById('message-content').value.trim();
    const tagsRaw = document.getElementById('message-tags').value;
    const tags = tagsRaw
        ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean)
        : null;
    const pinned = document.getElementById('message-pinned').checked;
    const user_id = window.currentUser ? window.currentUser.id : null;

    if (!title || !content) {
        alert('Preencha título e conteúdo!');
        return;
    }

    if (editingMessageId) {
        // Atualiza mensagem existente
        const updateData = {
            title,
            content,
            pinned
        };
        if (tags && tags.length) updateData.tags = tags;
        supabaseClient.from('messages').update(updateData).eq('id', editingMessageId).then(({ error }) => {
            if (error) {
                alert('Erro ao atualizar mensagem: ' + error.message);
                return;
            }
            editingMessageId = null;
            closeMessageModal();
            loadMessages();
        });
    } else {
        // Cria nova mensagem
        const newMessage = {
            title,
            content,
            pinned,
            order: messages.length
        };
        if (tags && tags.length) newMessage.tags = tags;
        if (user_id) newMessage.user_id = user_id;
        supabaseClient.from('messages').insert([newMessage]).then(({ error }) => {
            if (error) {
                alert('Erro ao salvar mensagem: ' + error.message);
                return;
            }
            closeMessageModal();
            loadMessages();
        });
    }
}

function closeMessageModal() {
    document.getElementById('message-modal').classList.add('hidden');
}


function copyMessage(messageId) {
    const message = messages.find(m => String(m.id) === String(messageId));
    const card = document.querySelector(`.message-card[data-message-id="${messageId}"]`);
    if (!message || !card || card.classList.contains('copied')) return;

    // Copia o conteúdo para a área de transferência
    navigator.clipboard.writeText(message.content).then(() => {
    card.classList.add('copied');
    // Não altera cor de fundo nem borda da card

        // Badge centralizada com animação e 3 pontinhos
        const copiedTag = document.createElement('div');
        copiedTag.className = 'copied-badge-center';
        copiedTag.innerHTML = `<span>Copiado!</span><span class="copied-dots"><span>.</span><span>.</span><span>.</span></span>`;
        copiedTag.style.pointerEvents = 'none';
        card.appendChild(copiedTag);

        // Animação dos pontinhos
        const dots = copiedTag.querySelectorAll('.copied-dots span');
        dots.forEach((dot, i) => {
            dot.style.animationDelay = (i * 0.2) + 's';
        });

        setTimeout(() => {
            card.classList.remove('copied');
            if (copiedTag && copiedTag.parentNode) copiedTag.parentNode.removeChild(copiedTag);
        }, 1200);
    });
}

function toggleMessagePin(messageId) {
    const message = messages.find(m => m.id === messageId);
    message.pinned = !message.pinned;
    loadMessages();
}

// Funções de drag and drop para cards de mensagens rápidas
function handleDragStart(event) {
    const messageId = event.currentTarget.getAttribute('data-message-id');
    draggedElement = event.currentTarget;
    draggedMessageId = messageId;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', messageId);
    setTimeout(() => {
        draggedElement.classList.add('opacity-50');
    }, 0);
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

function handleDrop(event) {
    event.preventDefault();
    const target = event.currentTarget;
    const targetId = target.getAttribute('data-message-id');
    if (draggedMessageId && targetId && draggedMessageId !== targetId) {
        const fromIdx = messages.findIndex(m => String(m.id) === String(draggedMessageId));
        const toIdx = messages.findIndex(m => String(m.id) === String(targetId));
        if (fromIdx !== -1 && toIdx !== -1) {
            // Remove o item da posição original
            const [removed] = messages.splice(fromIdx, 1);
            // Insere na nova posição (antes ou depois do alvo)
            let insertIdx = toIdx;
            // Se arrastando para baixo na lista, precisa ajustar o índice
            if (fromIdx < toIdx) insertIdx = toIdx;
            else insertIdx = toIdx;
            messages.splice(insertIdx, 0, removed);
            // Atualiza ordem no Supabase e local
            const updates = messages.map((msg, idx) => {
                msg.order = idx;
                return supabaseClient.from('messages').update({ order: idx }).eq('id', msg.id);
            });
            Promise.all(updates).then(() => {
                loadMessages();
            });
        }
    }
    if (draggedElement) draggedElement.classList.remove('opacity-50');
    draggedElement = null;
    draggedMessageId = null;
}

// Função para editar mensagem
function editMessage(messageId) {
    const message = messages.find(m => String(m.id) === String(messageId));
    if (!message) return;
    editingMessageId = message.id;
    // Preenche os campos do modal com os dados da mensagem
    document.getElementById('message-title').value = message.title || '';
    document.getElementById('message-content').value = message.content || '';
    document.getElementById('message-tags').value = (Array.isArray(message.tags) ? message.tags.join(', ') : '');
    document.getElementById('message-pinned').checked = !!message.pinned;
    openMessageModal();
}
// Função para deletar mensagem
function deleteMessage(messageId) {
    showConfirmModal('Tem certeza que deseja excluir esta mensagem?', function() {
        supabaseClient.from('messages').delete().eq('id', messageId).then(({ error }) => {
            if (error) {
                alert('Erro ao excluir mensagem: ' + error.message);
                return;
            }
            loadMessages();
        });
    });
}
// Função para duplicar mensagem
function duplicateMessage(messageId) {
    const message = messages.find(m => String(m.id) === String(messageId));
    if (!message) return;
    const newMessage = {
        title: message.title + ' (Cópia)',
        content: message.content,
        pinned: false,
        order: messages.length,
        tags: Array.isArray(message.tags) ? [...message.tags] : [],
        user_id: window.currentUser ? window.currentUser.id : null
    };
    supabaseClient.from('messages').insert([newMessage]).then(({ error }) => {
        if (error) {
            alert('Erro ao duplicar mensagem: ' + error.message);
            return;
        }
        loadMessages();
    });
}
// Services Module
function loadServices() {
    // Busca serviços do Supabase antes de atualizar a UI
    const user_id = window.currentUser ? window.currentUser.id : null;
    supabaseClient
        .from('services')
        .select('*')
        .eq('user_id', user_id)
        .order('created_at', { ascending: false })
        .then(({ data, error }) => {
            if (error) {
                console.error('Erro ao carregar serviços:', error.message);
                services = [];
            } else {
                services = data || [];
            }
            loadServicesList();
            loadServicesChart();
            loadServicesStats();
        });
}

function loadServicesList() {
    const container = document.getElementById('services-list');
    const start = (servicePage - 1) * servicesPerPage;
    const end = start + servicesPerPage;
    const pageServices = services.slice(start, end).filter(s => s !== undefined && s !== null);

    container.innerHTML = pageServices.map(service => `
        <div class="service-card group relative" onclick="openServiceDetailsModal('${service.id}')">
            <button onclick="event.stopPropagation(); deleteService('${service.id}')" title="Excluir serviço" class="absolute top-2 right-2 z-10 opacity-70 group-hover:opacity-100 bg-red-100 hover:bg-red-500 text-red-600 hover:text-white rounded-full p-1 transition-colors" style="font-size:1.1rem;display:flex;align-items:center;justify-content:center;">
                <i class="fas fa-trash"></i>
            </button>
            <div class="font-bold text-lg mb-1">${service.name}</div>
            <div class="text-xs text-gray-500 mb-2 line-clamp-2">${service.description}</div>
            <div class="flex flex-wrap gap-2 items-center" style="margin-bottom:12px;">
                ${service.statuses.map(s => `<span style="background:${s.color}22;color:${s.color};padding:4px 12px;border-radius:999px;font-size:15px;font-weight:600;letter-spacing:0.5px;display:inline-flex;align-items:center;margin-bottom:6px;min-height:32px;">${s.name}: <b>${s.count}</b></span>`).join('')}
            </div>
        </div>
    `).join('');

    // Paginação
    let pagHtml = '';
    const totalPages = Math.max(1, Math.ceil(services.length / servicesPerPage));
    if (totalPages > 1) {
        pagHtml = `<div class="col-span-3 flex justify-center mt-4 gap-2">
            <button onclick="servicePage--;loadServicesList()" ${servicePage===1?'disabled':''} class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm">Anterior</button>
            <span class="px-2 py-1">${servicePage} / ${totalPages}</span>
            <button onclick="servicePage++;loadServicesList()" ${servicePage===totalPages?'disabled':''} class="px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-sm">Próxima</button>
        </div>`;
    }
    container.innerHTML += pagHtml;
}

function openServiceDetailsModal(serviceId) {
    const modal = document.getElementById('service-details-modal');
    const service = services.find(s => s.id === serviceId);
    if (!service) return;
    document.getElementById('service-details-title').textContent = service.name;
    document.getElementById('service-details-desc').textContent = service.description;
    const isDark = document.documentElement.classList.contains('dark');
    document.getElementById('service-details-statuses').innerHTML = service.statuses.map(s => {
        const textColor = isDark ? '#fff' : '#222';
        const borderColor = isDark ? `${s.color}55` : '#e5e7eb';
        const bgColor = isDark ? `${s.color}22` : '#f3f4f6';
        return `<span style="
            background: ${bgColor};
            color: ${textColor};
            padding: 6px 20px 6px 20px;
            border-radius: 999px;
            font-size: 1.08rem;
            font-weight: 700;
            letter-spacing: 0.5px;
            display: inline-flex;
            align-items: center;
            margin-right: 10px;
            margin-bottom: 6px;
            min-height: 32px;
            box-shadow: 0 2px 8px ${s.color}22;
            border: 1.5px solid ${borderColor};">
            <span style='color: ${textColor};'>${s.name}:</span> <b style='color: ${textColor}; margin-left: 6px;'>${s.count}</b>
        </span>`;
    }).join('');

    // Adiciona botão e input para atualizar dados via planilha
    let updateDiv = document.getElementById('service-details-update-div');
    if (!updateDiv) {
        updateDiv = document.createElement('div');
        updateDiv.id = 'service-details-update-div';
        updateDiv.style = 'margin: 18px 0 10px 0; text-align: right;';
        document.getElementById('service-details-title').parentElement.appendChild(updateDiv);
    }
        updateDiv.innerHTML = `
            <input type="file" id="service-update-xlsx" accept=".xlsx,.xls" style="display:none" />
            <button id="service-update-btn" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm" style="margin-bottom:8px;">Atualizar dados</button>
            <button id="service-print-btn" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm ml-2" style="margin-bottom:8px;">Salvar</button>
        `;
        document.getElementById('service-update-btn').onclick = function() {
            document.getElementById('service-update-xlsx').click();
        };
        document.getElementById('service-update-xlsx').onchange = function(e) {
            handleServiceUpdateFromXLSX(e, serviceId);
        };
        document.getElementById('service-print-btn').onclick = function() {
            printServiceDetailsModalAsPDF(serviceId);
        };
function printServiceDetailsModalAsPDF(serviceId) {
    const modal = document.getElementById('service-details-modal');
    if (!modal) return;
    html2canvas(modal, { backgroundColor: null, useCORS: true, scale: 3, windowWidth: modal.scrollWidth, windowHeight: modal.scrollHeight }).then(canvas => {
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        // Tenta encontrar o construtor jsPDF correto
        let PDFClass = null;
        if (window.jspdf && window.jspdf.jsPDF) {
            PDFClass = window.jspdf.jsPDF;
        } else if (window.jsPDF) {
            PDFClass = window.jsPDF;
        } else if (window.JSPDF) {
            PDFClass = window.JSPDF;
        }
        if (!PDFClass) {
            alert('jsPDF não foi carregado corretamente.');
            return;
        }
        const pdf = new PDFClass({ orientation: 'landscape', unit: 'px', format: [canvas.width, canvas.height] });
        pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);
        pdf.save('relatorio-servico-' + serviceId + '.pdf');
    });
}

    // Gráfico de linha
    const ctxLine = document.getElementById('service-details-line').getContext('2d');
    Chart.getChart(ctxLine)?.destroy();
    new Chart(ctxLine, {
        type: 'line',
        data: {
            labels: service.statuses.map(s => s.name),
            datasets: [{
                label: 'Quantidade',
                data: service.statuses.map(s => s.count),
                borderColor: currentTheme === 'dark' ? '#60a5fa' : '#2563eb',
                backgroundColor: currentTheme === 'dark' ? 'rgba(59,130,246,0.18)' : 'rgba(59,130,246,0.12)',
                tension: 0.3,
                fill: true,
                pointBackgroundColor: service.statuses.map(s => s.color),
                pointRadius: 8,
                pointHoverRadius: 12,
                pointBorderWidth: 3,
                pointBorderColor: currentTheme === 'dark' ? '#1e293b' : '#fff'
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    backgroundColor: currentTheme === 'dark' ? '#1e293b' : '#fff',
                    titleColor: currentTheme === 'dark' ? '#fff' : '#2563eb',
                    bodyColor: currentTheme === 'dark' ? '#fff' : '#374151',
                    borderColor: currentTheme === 'dark' ? '#334155' : '#dbeafe',
                    borderWidth: 1
                },
                datalabels: {
                    display: true,
                    color: currentTheme === 'dark' ? '#60a5fa' : '#2563eb',
                    font: { weight: 'bold', size: 18 },
                    anchor: 'end',
                    align: 'top',
                    formatter: function(value) { return value; },
                    textStrokeColor: currentTheme === 'dark' ? '#1e293b' : '#fff',
                    textStrokeWidth: 3
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: currentTheme === 'dark' ? '#60a5fa' : '#2563eb',
                        font: { weight: 'bold' }
                },
                grid: { color: currentTheme === 'dark' ? '#334155' : '#dbeafe' }
            },
            x: {
                ticks: {
                    color: currentTheme === 'dark' ? '#60a5fa' : '#2563eb',
                    font: { weight: 'bold' }
                },
                grid: { display: false }
            }
        }
    },
    plugins: [ChartDataLabels]
    });

    // Gráfico de pizza
    const ctxPie = document.getElementById('service-details-pie').getContext('2d');
    Chart.getChart(ctxPie)?.destroy();
    new Chart(ctxPie, {
        type: 'pie',
        data: {
            labels: service.statuses.map(s => s.name),
            datasets: [{
                data: service.statuses.map(s => s.count),
                backgroundColor: service.statuses.map(s => s.color),
                borderWidth: 3,
                borderColor: currentTheme === 'dark' ? '#1e293b' : '#fff'
            }]
        },
        options: {
            responsive: false,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: currentTheme === 'dark' ? '#60a5fa' : '#2563eb',
                        font: { weight: 'normal', size: 14 }
                }
            },
            tooltip: {
                enabled: true,
                backgroundColor: currentTheme === 'dark' ? '#1e293b' : '#fff',
                titleColor: currentTheme === 'dark' ? '#fff' : '#2563eb',
                bodyColor: currentTheme === 'dark' ? '#fff' : '#374151',
                borderColor: currentTheme === 'dark' ? '#334155' : '#dbeafe',
                borderWidth: 1
            },
            datalabels: {
                display: true,
                color: currentTheme === 'dark' ? '#e0e7ef' : '#374151',
                font: { weight: 'normal', size: 15 },
                formatter: function(value, ctx) {
                    const total = ctx.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                    const percent = total ? Math.round((value / total) * 100) : 0;
                    return value + ' (' + percent + '%)';
                },
                textStrokeColor: currentTheme === 'dark' ? '#1e293b' : '#fff',
                textStrokeWidth: 2
            }
        }
    },
    plugins: [ChartDataLabels]
    });

    modal.classList.remove('hidden');
}
// Atualiza dados do serviço selecionado via planilha no modal de detalhes
function handleServiceUpdateFromXLSX(event, serviceId) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1});
        if (!rows.length) {
            return alert('Planilha vazia!');
        }
        // Procura coluna status (case insensitive)
        const header = rows[0].map(h => h ? h.toString().toLowerCase() : '');
        const statusIdx = header.findIndex(h => h === 'status');
        if (statusIdx === -1) {
            return alert('Coluna "Status" não encontrada!');
        }
        const statusCounts = {};
        for (let i=1; i<rows.length; i++) {
            const status = (rows[i][statusIdx] || '').toString().trim();
            if (!status) continue;
            statusCounts[status] = (statusCounts[status]||0)+1;
        }
        const statuses = Object.entries(statusCounts).map(([name,count],i) => ({
            name,
            color: ['#3b82f6','#f59e0b','#10b981','#ef4444','#6366f1','#fbbf24','#a21caf'][i%7],
            count
        }));
        if (!statuses.length) {
            return alert('Nenhum status encontrado!');
        }
        // Atualiza serviço no Supabase
        supabaseClient.from('services').update({
            statuses,
            description: 'Serviço atualizado da planilha ' + file.name
        }).eq('id', serviceId).then(({ error }) => {
            if (error) {
                alert('Erro ao atualizar serviço: ' + error.message);
                return;
            }
            alert('Serviço atualizado com sucesso!');
            loadServices();
            updateDashboardCounts();
            // Atualiza modal
            setTimeout(() => openServiceDetailsModal(serviceId), 500);
        });
    };
    reader.readAsArrayBuffer(file);
}
function closeServiceDetailsModal() {
    document.getElementById('service-details-modal').classList.add('hidden');
}

function importServiceFromXLSX(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (window.importingService) return;
    window.importingService = true;
    const reader = new FileReader();
    reader.onload = function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, {header:1});
        if (!rows.length) {
            window.importingService = false;
            return alert('Planilha vazia!');
        }
        // Procura coluna status (case insensitive)
        const header = rows[0].map(h => h ? h.toString().toLowerCase() : '');
        const statusIdx = header.findIndex(h => h === 'status');
        if (statusIdx === -1) {
            window.importingService = false;
            return alert('Coluna "Status" não encontrada!');
        }
        const statusCounts = {};
        for (let i=1; i<rows.length; i++) {
            const status = (rows[i][statusIdx] || '').toString().trim();
            if (!status) continue;
            statusCounts[status] = (statusCounts[status]||0)+1;
        }
        const statuses = Object.entries(statusCounts).map(([name,count],i) => ({
            name,
            color: ['#3b82f6','#f59e0b','#10b981','#ef4444','#6366f1','#fbbf24','#a21caf'][i%7],
            count
        }));
        if (!statuses.length) {
            window.importingService = false;
            return alert('Nenhum status encontrado!');
        }
        const serviceName = 'Importado: ' + (file.name.replace(/\.[^/.]+$/, ""));
        const user_id = window.currentUser ? window.currentUser.id : null;

        // Função para liberar o lock só após garantir reload
        function finishImport() {
            loadServices();
            updateDashboardCounts();
            setTimeout(() => { window.importingService = false; }, 800);
        }

        // Sempre consulta o Supabase para checar serviço existente (NUNCA usa array local)
        supabaseClient.from('services').select('id').eq('name', serviceName).eq('user_id', user_id).then(({ data, error }) => {
            if (error) {
                window.importingService = false;
                alert('Erro ao verificar serviço existente: ' + error.message);
                return;
            }
            const newService = {
                name: serviceName,
                description: 'Serviço importado da planilha ' + file.name,
                statuses,
                created_at: new Date().toISOString(),
                user_id
            };
            if (data && data.length > 0) {
                // Serviço já existe, pede confirmação
                showConfirmModal(
                    'Já existe um serviço com esse nome. Deseja substituir pelo novo?',
                    function() { // onConfirm
                        supabaseClient.from('services').update(newService).eq('id', data[0].id).then(({ error }) => {
                            if (error) {
                                window.importingService = false;
                                alert('Erro ao substituir serviço: ' + error.message);
                                return;
                            }
                            alert('Serviço substituído com sucesso!');
                            loadServices();
                            updateDashboardCounts();
                            setTimeout(() => { window.importingService = false; }, 800);
                        });
                    },
                    function() { // onCancel
                        window.importingService = false;
                    }
                );
            } else {
                supabaseClient.from('services').insert([newService]).then(({ error }) => {
                    if (error) {
                        window.importingService = false;
                        alert('Erro ao importar serviço: ' + error.message);
                        return;
                    }
                    alert('Serviço importado com sucesso!');
                    loadServices();
                    updateDashboardCounts();
                    setTimeout(() => { window.importingService = false; }, 800);
                });
            }
        });
    };
    reader.readAsArrayBuffer(file);
}

function loadServicesChart() {
    const canvas = document.getElementById('services-pie-chart');
    if (!canvas) return; // Canvas removido, não faz nada
    const ctx = canvas.getContext('2d');
    // Clear previous chart
    Chart.getChart(canvas)?.destroy();
    
    if (services.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = currentTheme === 'dark' ? '#9ca3af' : '#6b7280';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Nenhum dado disponível', canvas.width / 2, canvas.height / 2);
        return;
    }
    
    const allStatuses = services.flatMap(service => service.statuses);
    const statusGroups = {};
    
    allStatuses.forEach(status => {
        if (statusGroups[status.name]) {
            statusGroups[status.name].count += status.count;
        } else {
            statusGroups[status.name] = { ...status };
        }
    });
    
    const labels = Object.keys(statusGroups);
    const data = labels.map(label => statusGroups[label].count);
    const colors = labels.map(label => statusGroups[label].color);
    
    new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        color: currentTheme === 'dark' ? '#e5e7eb' : '#374151'
                    }
                }
            }
        }
    });
}

function loadServicesStats() {
    const container = document.getElementById('services-stats');
    if (!container) return; // Se não existe, não faz nada

    if (services.length === 0) {
        container.innerHTML = '<p class="text-gray-500 dark:text-gray-400 text-center py-4">Nenhuma estatística disponível</p>';
        return;
    }

    const totalItems = services.reduce((sum, service) => 
        sum + service.statuses.reduce((statusSum, status) => statusSum + status.count, 0), 0
    );

    const allStatuses = services.flatMap(service => service.statuses);
    const statusGroups = {};

    allStatuses.forEach(status => {
        if (statusGroups[status.name]) {
            statusGroups[status.name].count += status.count;
        } else {
            statusGroups[status.name] = { ...status };
        }
    });

    container.innerHTML = Object.entries(statusGroups).map(([name, status]) => {
        const percentage = totalItems > 0 ? ((status.count / totalItems) * 100).toFixed(1) : 0;
        return `
            <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="flex items-center">
                    <div class="w-4 h-4 rounded-full mr-3" style="background-color: ${status.color}"></div>
                    <span class="font-medium">${name}</span>
                </div>
                <div class="text-right">
                    <div class="font-bold">${status.count}</div>
                    <div class="text-sm text-gray-500 dark:text-gray-400">${percentage}%</div>
                </div>
            </div>
        `;
    }).join('');
}

function openServiceModal(serviceId = null) {
    editingServiceId = serviceId;
    const modal = document.getElementById('service-modal');
    const title = document.getElementById('service-modal-title');
    
    if (serviceId) {
        const service = services.find(s => s.id === serviceId);
        title.textContent = 'Editar Serviço';
        document.getElementById('service-name').value = service.name;
        document.getElementById('service-description').value = service.description;
        loadServiceStatuses(service.statuses);
    } else {
        title.textContent = 'Novo Serviço';
        document.getElementById('service-name').value = '';
        document.getElementById('service-description').value = '';
        loadServiceStatuses([]);
    }
    
    modal.classList.remove('hidden');
}

function closeServiceModal() {
    document.getElementById('service-modal').classList.add('hidden');
    editingServiceId = null;
}

function loadServiceStatuses(statuses = []) {
    const container = document.getElementById('service-status-list');
    
    if (statuses.length === 0) {
        statuses = [{ name: '', color: '#3b82f6', count: 0 }];
    }
    
    container.innerHTML = statuses.map((status, index) => `
        <div class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
            <input type="text" placeholder="Nome do status" value="${status.name}" class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm" data-field="name" data-index="${index}">
            <input type="color" value="${status.color}" class="w-12 h-8 border border-gray-300 dark:border-gray-600 rounded" data-field="color" data-index="${index}">
            <input type="number" placeholder="Qtd" value="${status.count}" min="0" class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm" data-field="count" data-index="${index}">
            <button type="button" onclick="removeServiceStatus(${index})" class="text-red-600 hover:text-red-700 p-1">
                <i class="fas fa-trash text-sm"></i>
            </button>
        </div>
    `).join('');
}

function addServiceStatus() {
    const container = document.getElementById('service-status-list');
    const currentStatuses = Array.from(container.children);
    const newIndex = currentStatuses.length;
    
    const newStatusHtml = `
        <div class="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
            <input type="text" placeholder="Nome do status" value="" class="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm" data-field="name" data-index="${newIndex}">
            <input type="color" value="#3b82f6" class="w-12 h-8 border border-gray-300 dark:border-gray-600 rounded" data-field="color" data-index="${newIndex}">
            <input type="number" placeholder="Qtd" value="0" min="0" class="w-20 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-sm" data-field="count" data-index="${newIndex}">
            <button type="button" onclick="removeServiceStatus(${newIndex})" class="text-red-600 hover:text-red-700 p-1">
                <i class="fas fa-trash text-sm"></i>
            </button>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', newStatusHtml);
}

function removeServiceStatus(index) {
    const container = document.getElementById('service-status-list');
    const statusElements = container.children;
    
    if (statusElements.length > 1) {
        statusElements[index].remove();
        // Re-index remaining elements
        Array.from(container.children).forEach((element, newIndex) => {
            element.querySelectorAll('[data-index]').forEach(input => {
                input.setAttribute('data-index', newIndex);
            });
            const removeButton = element.querySelector('button[onclick*="removeServiceStatus"]');
            if (removeButton) {
                removeButton.setAttribute('onclick', `removeServiceStatus(${newIndex})`);
            }
        });
    }
}

function saveService() {
    const name = document.getElementById('service-name').value.trim();
    const description = document.getElementById('service-description').value.trim();
    // Coleta os status
    const statusElements = document.querySelectorAll('#service-status-list > div');
    const statuses = Array.from(statusElements).map(el => {
        return {
            name: el.querySelector('[data-field="name"]').value.trim(),
            color: el.querySelector('[data-field="color"]').value,
            count: Number(el.querySelector('[data-field="count"]').value) || 0
        };
    }).filter(s => s.name);

    if (!name) {
        alert('Preencha o nome do serviço!');
        return;
    }
    if (!statuses.length) {
        alert('Adicione pelo menos um status!');
        return;
    }


    const user_id = window.currentUser ? window.currentUser.id : null;
    const newService = {
        name,
        description,
        statuses,
        created_at: new Date().toISOString(),
        user_id
    };

    supabaseClient.from('services').insert([newService]).then(async ({ error, data }) => {
        if (error) {
            alert('Erro ao salvar serviço: ' + error.message);
            return;
        }
        // Log de atividade: criação de serviço
        const display_name = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.name)
            ? window.currentUser.user_metadata.name
            : (window.currentUser && (window.currentUser.name || window.currentUser.email)) || 'Usuário';
        await supabaseClient.from('activities').insert([
            {
                type: 'service',
                description: `Novo serviço criado: ${name}`,
                user_id,
                display_name,
                action: 'create',
                group_id: window.currentGroupId,
                timestamp: new Date().toISOString()
            }
        ]);
        closeServiceModal();
        loadServices();
        updateDashboardCounts();
    });
}

// Função para editar serviço
function editService(serviceId) {
    const name = document.getElementById('service-name').value.trim();
    const description = document.getElementById('service-description').value.trim();
    const statusElements = document.querySelectorAll('#service-status-list > div');
    const statuses = Array.from(statusElements).map(el => {
        return {
            name: el.querySelector('[data-field="name"]').value.trim(),
            color: el.querySelector('[data-field="color"]').value,
            count: Number(el.querySelector('[data-field="count"]').value) || 0
        };
    }).filter(s => s.name);

    if (!name) {
        alert('Preencha o nome do serviço!');
        return;
    }
    if (!statuses.length) {
        alert('Adicione pelo menos um status!');
        return;
    }

    const user_id = window.currentUser ? window.currentUser.id : null;
    const updateData = {
        name,
        description,
        statuses,
        user_id
    };
    supabaseClient.from('services').update(updateData).eq('id', serviceId).eq('user_id', user_id).then(async ({ error }) => {
        if (error) {
            alert('Erro ao atualizar serviço: ' + error.message);
            return;
        }
        // Log de atividade: edição de serviço
        const display_name = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.name)
            ? window.currentUser.user_metadata.name
            : (window.currentUser && (window.currentUser.name || window.currentUser.email)) || 'Usuário';
        await supabaseClient.from('activities').insert([
            {
                type: 'service',
                description: `Serviço editado: ${name}`,
                user_id,
                display_name,
                action: 'edit',
                group_id: window.currentGroupId,
                timestamp: new Date().toISOString()
            }
        ]);
        closeServiceModal();
        loadServices();
        updateDashboardCounts();
    });
}

// Função para deletar serviço
function deleteService(serviceId) {
    const user_id = window.currentUser ? window.currentUser.id : null;
    showConfirmModal('Tem certeza que deseja excluir este serviço?', async function() {
        // Buscar nome do serviço antes de deletar
        let serviceName = '';
        try {
            const { data: serviceData, error: fetchError } = await supabaseClient.from('services').select('name').eq('id', serviceId).single();
            if (!fetchError && serviceData && serviceData.name) {
                serviceName = serviceData.name;
            } else {
                serviceName = '(desconhecido)';
            }
        } catch (e) {
            serviceName = '(desconhecido)';
        }
        supabaseClient.from('services').delete().eq('id', serviceId).eq('user_id', user_id).then(async ({ error }) => {
            if (error) {
                alert('Erro ao excluir serviço: ' + error.message);
                return;
            }
            // Log de atividade: exclusão de serviço
            const display_name = (window.currentUser && window.currentUser.user_metadata && window.currentUser.user_metadata.name)
                ? window.currentUser.user_metadata.name
                : (window.currentUser && (window.currentUser.name || window.currentUser.email)) || 'Usuário';
            await supabaseClient.from('activities').insert([
                {
                    type: 'service',
                    description: `Serviço excluído: ${serviceName}`,
                    user_id,
                    display_name,
                    action: 'delete',
                    group_id: window.currentGroupId,
                    timestamp: new Date().toISOString()
                }
            ]);
            loadServices();
            updateDashboardCounts();
        });
    });
}

// Editar procedimento existente
function editProcedure(procId) {
    const proc = procedures.find(p => String(p.id) === String(procId));
    if (!proc) return;
    openProcedureModal();
    // Preencher campos do modal com dados do procedimento
    setTimeout(() => {
        document.getElementById('procedure-title').value = proc.title || '';
        document.getElementById('procedure-category').value = proc.category || '';
        document.getElementById('procedure-description').value = proc.description || '';
        // Limpar passos existentes
        const stepsContainer = document.getElementById('procedure-steps-list');
        stepsContainer.innerHTML = '';
        (proc.steps || []).forEach((step, idx) => {
            addProcedureStep(step.text || '', step.imageData || '');
        });
        // Guardar id para salvar como update
        document.getElementById('procedure-modal').setAttribute('data-edit-id', proc.id);
    }, 100); // Aguarda modal abrir
}
