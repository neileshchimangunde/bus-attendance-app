console.log("🔵 Script Loaded");

// ✅ Update this URL (paste your Apps Script published URL here)
const API_URL = "https://script.google.com/macros/s/AKfycbxPMcwbXGhxRI1Y1DjfOjsT973-QMHQWR_IgYCOeQE_elSi7uU4sLIrJGzDPKGh8hmR/exec";

async function apiCall(action, data = {}) {
    const body = JSON.stringify({ path: action, ...data });

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            body,
            headers: { "Content-Type": "application/json" }
        });

        return await response.json();
    } catch (err) {
        console.error("❌ API ERROR:", err);
        return { ok: false, error: "fetch_failed" };
    }
}

document.getElementById("btnLogin").addEventListener("click", async () => {
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    const res = await apiCall("login", { email, password });

    if (!res.ok) {
        document.getElementById("loginError").innerHTML = "Login Failed: " + res.error;
        return;
    }

    localStorage.setItem("token", res.token);
    localStorage.setItem("role", res.role);
    localStorage.setItem("bus_no", res.bus_no);
    localStorage.setItem("email", email);

    document.getElementById("loginContainer").classList.add("hidden");
    document.getElementById("dashboardContainer").classList.remove("hidden");

    document.getElementById("loggedUser").innerHTML = `Logged in as: ${email}`;

    loadStudents();
});

// ✅ Load students list in dashboard
async function loadStudents() {
    const token = localStorage.getItem("token");
    const bus_no = localStorage.getItem("bus_no");

    const res = await apiCall("getStudents", { token, bus_no });

    const div = document.getElementById("studentsSection");

    if (!res.ok) {
        div.innerHTML = `<p class="text-red-600">Failed to load students</p>`;
        return;
    }

    div.innerHTML = `
        <h3 class="font-bold mb-2">Students</h3>
        <ul class="list-disc ml-6">
            ${res.students.map(s => `<li>${s.student_name}</li>`).join("")}
        </ul>
    `;
}

// ✅ Logout
document.getElementById("btnLogout").addEventListener("click", () => {
    localStorage.clear();
    location.reload();
});
