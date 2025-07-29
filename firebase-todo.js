// Firebase configuration — replace with your own project's config if needed
const firebaseConfig = {
  apiKey: "AIzaSyDC5ofRU-jkxHRgkZxQU1tLbG0PptoObDU",
  authDomain: "todo-app-a8de6.firebaseapp.com",
  projectId: "todo-app-a8de6",
  storageBucket: "todo-app-a8de6.appspot.com",
  messagingSenderId: "611510738860",
  appId: "1:611510738860:web:bff3af5ba97d0cfe21a409",
  measurementId: "G-MPF9GLZPBN"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Get DOM elements by ID
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const usernameSpan = document.getElementById('username');
const appMain = document.getElementById('app');
const clockDiv = document.getElementById('clock');
const form = document.getElementById('task-form');
const tasksBody = document.getElementById('tasks-body');
const totalSpendTd = document.getElementById('total-spend');
const calendarContent = document.getElementById('calendar-content');

let currentUser = null;
let unsubscribeTasks = null;

// Update the clock every second
function updateClock() {
  clockDiv.textContent = new Date().toLocaleString();
}
setInterval(updateClock, 1000);
updateClock();

// Login with Google
loginBtn.onclick = () => {
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => alert('Login error: ' + err.message));
};

// Logout
logoutBtn.onclick = () => {
  auth.signOut();
};

// Determine task status automatically
function autoStatusUpdate(dueDate, checked) {
  const todayStr = new Date().toISOString().slice(0, 10);
  if (checked) return "completed";
  if (dueDate < todayStr) return "pending";
  if (dueDate === todayStr) return "inprogress";
  return "pending";
}

// Render the tasks list in the table
function renderTasks(tasks) {
  tasksBody.innerHTML = '';
  let totalSpend = 0;

  tasks.forEach(task => {
    const tr = document.createElement('tr');
    if (task.status === 'completed') tr.classList.add('completed');

    // Checkbox for completed
    const completeTd = document.createElement('td');
    const checkbox = document.createElement('input');
    checkbox.type = "checkbox";
    checkbox.checked = task.checked;
    checkbox.onchange = () => toggleComplete(task.id, checkbox.checked);
    completeTd.appendChild(checkbox);
    tr.appendChild(completeTd);

    // Title editable input
    const titleTd = document.createElement('td');
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.value = task.title;
    titleInput.style.width = '100%';
    titleInput.onchange = () => updateTaskField(task.id, { title: titleInput.value });
    titleTd.appendChild(titleInput);
    tr.appendChild(titleTd);

    // Priority select + color chip
    const prioTd = document.createElement('td');
    const prioSelect = document.createElement('select');
    ['high', 'medium', 'low'].forEach(p => {
      const opt = document.createElement('option');
      opt.value = p;
      opt.textContent = p.charAt(0).toUpperCase() + p.slice(1);
      if (p === task.priority) opt.selected = true;
      prioSelect.appendChild(opt);
    });
    prioSelect.onchange = () => updateTaskField(task.id, { priority: prioSelect.value });
    prioTd.appendChild(prioSelect);

    const prioChip = document.createElement('span');
    prioChip.className = 'chip priority-' + task.priority;
    prioChip.style.marginLeft = '8px';
    prioChip.textContent = task.priority;
    prioTd.appendChild(prioChip);
    tr.appendChild(prioTd);

    // Status chip (read-only)
    const statusTd = document.createElement('td');
    const statusChip = document.createElement('span');
    statusChip.className = 'chip status-' + task.status;
    statusChip.textContent = task.status;
    statusTd.appendChild(statusChip);
    tr.appendChild(statusTd);

    // Due date input
    const dueTd = document.createElement('td');
    const dueInput = document.createElement('input');
    dueInput.type = 'date';
    dueInput.value = task.due_date || '';
    dueInput.onchange = () => updateTaskField(task.id, { due_date: dueInput.value });
    dueTd.appendChild(dueInput);
    tr.appendChild(dueTd);

    // Money spent input
    const spendTd = document.createElement('td');
    const spendInput = document.createElement('input');
    spendInput.type = 'number';
    spendInput.min = '0';
    spendInput.value = task.spend || 0;
    spendInput.style.width = '80px';
    spendInput.onchange = () => updateTaskField(task.id, { spend: Number(spendInput.value) || 0 });
    spendTd.appendChild(spendInput);
    tr.appendChild(spendTd);

    // Delete button
    const actionsTd = document.createElement('td');
    const delBtn = document.createElement('button');
    delBtn.textContent = 'Delete';
    delBtn.style.background = '#d32f2f';
    delBtn.onclick = () => deleteTask(task.id);
    actionsTd.appendChild(delBtn);
    tr.appendChild(actionsTd);

    tasksBody.appendChild(tr);

    totalSpend += Number(task.spend) || 0;
  });

  totalSpendTd.textContent = `₹${totalSpend.toFixed(2)}`;
}

// Render grouped tasks by due date (calendar view)
function renderCalendar(tasks) {
  calendarContent.innerHTML = '';
  const grouped = {};
  tasks.forEach(t => {
    if (!grouped[t.due_date]) grouped[t.due_date] = [];
    grouped[t.due_date].push(t);
  });

  const dates = Object.keys(grouped).sort();

  if (dates.length === 0) {
    calendarContent.textContent = 'No tasks yet';
    return;
  }

  dates.forEach(date => {
    const div = document.createElement('div');
    div.className = 'calendar-day';

    const header = document.createElement('strong');
    header.textContent = date;
    div.appendChild(header);

    const ul = document.createElement('ul');
    grouped[date].forEach(task => {
      const li = document.createElement('li');
      li.textContent = `${task.title} (₹${task.spend || 0}) [${task.priority}]${task.checked ? ' ✅' : ''}`;
      li.style.color = task.checked ? 'green' : '#222';
      ul.appendChild(li);
    });

    div.appendChild(ul);
    calendarContent.appendChild(div);
  });
}

// Handle new task form submission
form.onsubmit = async (e) => {
  e.preventDefault();
  if (!currentUser) return alert('Please login to add tasks');

  const title = form['title'].value.trim();
  const priority = form['priority'].value;
  const due_date = form['due-date'].value;
  const spend = Number(form['spend'].value) || 0;

  if (!title || !due_date) {
    alert('Please enter title and due date');
    return;
  }

  const task = {
    title,
    priority,
    due_date,
    spend,
    checked: false,
    status: autoStatusUpdate(due_date, false),
    created_at: firebase.firestore.FieldValue.serverTimestamp(),
    updated_at: firebase.firestore.FieldValue.serverTimestamp(),
    userId: currentUser.uid
  };

  try {
    await db.collection('tasks').add(task);
    form.reset();
    form['due-date'].value = new Date().toISOString().slice(0, 10);
  } catch (err) {
    alert('Error adding task: ' + err.message);
  }
};

// Update fields of a task document
async function updateTaskField(id, updatedFields) {
  if (!currentUser) return;

  if ('due_date' in updatedFields || 'checked' in updatedFields) {
    const taskDoc = await db.collection('tasks').doc(id).get();
    const tdata = taskDoc.data();
    const due_date = updatedFields.due_date || tdata.due_date;
    const checked = ('checked' in updatedFields) ? updatedFields.checked : tdata.checked;
    updatedFields.status = autoStatusUpdate(due_date, checked);
  }

  updatedFields.updated_at = firebase.firestore.FieldValue.serverTimestamp();
  await db.collection('tasks').doc(id).update(updatedFields);
}

// Toggle task completion
async function toggleComplete(id, checked) {
  await updateTaskField(id, { checked });
}

// Delete a task document
async function deleteTask(id) {
  if (confirm('Delete this task?')) {
    await db.collection('tasks').doc(id).delete();
  }
}

// Listen for auth state change and populate tasks
auth.onAuthStateChanged(user => {
  currentUser = user;

  if (user) {
    usernameSpan.textContent = `Hello, ${user.displayName}`;
    loginBtn.style.display = 'none';
    logoutBtn.style.display = '';
    appMain.style.display = 'block';
    form['due-date'].value = new Date().toISOString().slice(0, 10);

    if (unsubscribeTasks) unsubscribeTasks();

    unsubscribeTasks = db.collection('tasks')
      .where('userId', '==', user.uid)
      .orderBy('due_date')
      .orderBy('priority')
      .onSnapshot(snapshot => {
        const tasks = [];
        snapshot.forEach(doc => {
          tasks.push({ id: doc.id, ...doc.data() });
        });
        renderTasks(tasks);
        renderCalendar(tasks);
      }, err => {
        console.error('Firestore listener error:', err);
      });
  } else {
    usernameSpan.textContent = 'Not signed in';
    loginBtn.style.display = '';
    logoutBtn.style.display = 'none';
    appMain.style.display = 'none';

    if (unsubscribeTasks) {
      unsubscribeTasks();
      unsubscribeTasks = null;
    }
  }
});
