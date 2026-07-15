/* ==========================================================
   COMPAREX SCRIPT
========================================================== */

/* ===========================
   DARK MODE
=========================== */
console.log("JavaScript Connected!");
const themeBtn = document.getElementById("themeToggle");
const themeIcon = themeBtn ? themeBtn.querySelector("i") : null;
console.log("themeBtn =", themeBtn);

const savedTheme = localStorage.getItem("theme");

if (savedTheme === "dark") {

    document.body.classList.add("dark-mode");

    if (themeIcon) {
        themeIcon.classList.remove("fa-moon");
        themeIcon.classList.add("fa-sun");
    }

}

if (themeBtn) {

    themeBtn.addEventListener("click", () => {

        document.body.classList.toggle("dark-mode");

        if (document.body.classList.contains("dark-mode")) {

            localStorage.setItem("theme", "dark");

            themeIcon.classList.remove("fa-moon");
            themeIcon.classList.add("fa-sun");

        } else {

            localStorage.setItem("theme", "light");

            themeIcon.classList.remove("fa-sun");
            themeIcon.classList.add("fa-moon");

        }

    });

}

/* ===========================
   SEARCH MODE BUTTONS
=========================== */

const nameMode = document.getElementById("nameMode");
const urlMode = document.getElementById("urlMode");

if (nameMode && urlMode) {

    nameMode.addEventListener("click", () => {

        nameMode.classList.add("active");
        urlMode.classList.remove("active");

        document.getElementById("searchInput").placeholder =
            "Search iPhone 16, MacBook Air, PS5...";

    });

    urlMode.addEventListener("click", () => {

        urlMode.classList.add("active");
        nameMode.classList.remove("active");

        document.getElementById("searchInput").placeholder =
            "Paste Product URL here...";

    });

}

/* ===========================
   COMPARE BUTTON
=========================== */

const compareBtn = document.getElementById("compareBtn");

if (compareBtn) {

    compareBtn.addEventListener("click", () => {

        const input = document.getElementById("searchInput").value.trim();

        if (input === "") {

            alert("Please enter a product name or URL.");

            return;

        }

        alert("Searching for: " + input);

    });

}

/* ===========================
   CATEGORY RIPPLE EFFECT
=========================== */

const categoryCards = document.querySelectorAll(".category-card");

categoryCards.forEach(card => {

    card.addEventListener("click", function(e){

        const ripple = document.createElement("span");

        ripple.className = "ripple";

        const rect = this.getBoundingClientRect();

        ripple.style.left = (e.clientX - rect.left) + "px";
        ripple.style.top = (e.clientY - rect.top) + "px";

        this.appendChild(ripple);

        setTimeout(() => {

            ripple.remove();

        },600);

    });

});

/* ===========================
   BRAND HOVER EFFECT
=========================== */

const brands = document.querySelectorAll(".brand-item");

brands.forEach(brand => {

    brand.addEventListener("mouseenter", () => {

        brand.style.zIndex = "10";

    });

    brand.addEventListener("mouseleave", () => {

        brand.style.zIndex = "1";

    });

});

/* ===========================
   PRODUCT CARD TILT
=========================== */

const productCards = document.querySelectorAll(".product-card");

productCards.forEach(card => {

    card.addEventListener("mousemove", (e) => {

        const rect = card.getBoundingClientRect();

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        const rotateY = ((x / rect.width) - 0.5) * 10;
        const rotateX = ((rect.height / 2 - y) / rect.height) * 10;

        card.style.transform = `
            perspective(900px)
            rotateX(${rotateX}deg)
            rotateY(${rotateY}deg)
            translateY(-10px)
        `;

    });

    card.addEventListener("mouseleave", () => {

        card.style.transform = "";

    });

});

/* ===========================
   SMOOTH SCROLL
=========================== */

document.querySelectorAll('a[href^="#"]').forEach(anchor => {

    anchor.addEventListener("click", function(e){

        e.preventDefault();

        const target = document.querySelector(this.getAttribute("href"));

        if(target){

            target.scrollIntoView({

                behavior:"smooth"

            });

        }

    });

});

/* ===========================
   HERO FADE IN
=========================== */

window.addEventListener("load", () => {

    document.body.classList.add("loaded");

});

/* ===========================
   REVEAL ON SCROLL
=========================== */

const observer = new IntersectionObserver((entries)=>{

    entries.forEach(entry=>{

        if(entry.isIntersecting){

            entry.target.classList.add("show");

        }

    });

},{
    threshold:.15
});

document.querySelectorAll(

".category-card,.product-card,.feature-card,.market-card"

).forEach(el=>{

    observer.observe(el);

});

/* ===========================
   SHOPPING CART
=========================== */

const cartBtn = document.getElementById("cartBtn");
const cartSidebar = document.getElementById("cartSidebar");
const cartOverlay = document.getElementById("cartOverlay");
const closeCart = document.getElementById("closeCart");

if (cartBtn && cartSidebar && cartOverlay && closeCart) {

    cartBtn.addEventListener("click", () => {

        cartSidebar.classList.add("active");
        cartOverlay.classList.add("active");

    });

    closeCart.addEventListener("click", () => {

        cartSidebar.classList.remove("active");
        cartOverlay.classList.remove("active");

    });

    cartOverlay.addEventListener("click", () => {

        cartSidebar.classList.remove("active");
        cartOverlay.classList.remove("active");

    });

    document.addEventListener("keydown", (e) => {

        if (e.key === "Escape") {

            cartSidebar.classList.remove("active");
            cartOverlay.classList.remove("active");

        }

    });

}

/* ==========================================================
   WISHLIST DRAWER
========================================================== */

const wishlistBtn = document.getElementById("wishlistBtn");
const wishlistSidebar = document.getElementById("wishlistSidebar");
const wishlistOverlay = document.getElementById("wishlistOverlay");
const closeWishlist = document.getElementById("closeWishlist");


// Open Wishlist
wishlistBtn.addEventListener("click", () => {

    wishlistSidebar.classList.add("active");
    wishlistOverlay.classList.add("active");

});


// Close Button
closeWishlist.addEventListener("click", () => {

    wishlistSidebar.classList.remove("active");
    wishlistOverlay.classList.remove("active");

});


// Click Outside
wishlistOverlay.addEventListener("click", () => {

    wishlistSidebar.classList.remove("active");
    wishlistOverlay.classList.remove("active");

});


// ESC Key
document.addEventListener("keydown", (e)=>{

    if(e.key==="Escape"){

        wishlistSidebar.classList.remove("active");
        wishlistOverlay.classList.remove("active");

    }

});

/* ==========================================
   LOGIN MODAL
========================================== */

const loginBtn = document.getElementById("loginBtn");
const loginModal = document.getElementById("loginModal");
const loginOverlay = document.getElementById("loginOverlay");
const closeLogin = document.getElementById("closeLogin");

const passwordInput = document.getElementById("passwordInput");
const togglePassword = document.getElementById("togglePassword");

// -----------------------------
// OPEN LOGIN
// -----------------------------

loginBtn.addEventListener("click", () => {

    loginModal.classList.add("active");
    loginOverlay.classList.add("active");

});

// -----------------------------
// CLOSE LOGIN BUTTON
// -----------------------------

closeLogin.addEventListener("click", () => {

    loginModal.classList.remove("active");
    loginOverlay.classList.remove("active");

});

// -----------------------------
// CLICK OUTSIDE
// -----------------------------

loginOverlay.addEventListener("click", () => {

    loginModal.classList.remove("active");
    loginOverlay.classList.remove("active");

});

// -----------------------------
// ESC KEY
// -----------------------------

document.addEventListener("keydown", (e) => {

    if (e.key === "Escape") {

        loginModal.classList.remove("active");
        loginOverlay.classList.remove("active");

    }

});

// -----------------------------
// SHOW / HIDE PASSWORD
// -----------------------------

togglePassword.addEventListener("click", () => {

    if (passwordInput.type === "password") {

        passwordInput.type = "text";

        togglePassword.classList.remove("fa-eye");
        togglePassword.classList.add("fa-eye-slash");

    } else {

        passwordInput.type = "password";

        togglePassword.classList.remove("fa-eye-slash");
        togglePassword.classList.add("fa-eye");

    }

});

/* ==========================================
      CompareX Curved Radial Menu
========================================== */

const menuBtn = document.getElementById("menuBtn");
const radialMenu = document.getElementById("radialMenu");
const radialOverlay = document.getElementById("radialOverlay");
const closeRadial = document.getElementById("closeRadial");
const dragHandle = document.getElementById("dragHandle");

const radialItems = document.querySelectorAll(".radial-item");

let offset = 0;
let dragging = false;

/* --------------------------
   FIXED CURVE POINTS
---------------------------*/

const curvePoints = [

    { x: 225, y: 60 },   // My Account

    { x: 200, y: 130 },  // Wishlist

    { x: 180, y: 205 },  // Cart

    { x: 165, y: 290 },  // Today's Deals

    { x: 160, y: 385 },  // Price History

    { x: 165, y: 480 },  // Categories

    { x: 180, y: 565 },  // Brands

    { x: 200, y: 640 },  // Support

    { x: 225, y: 710 }   // Settings

];

/* --------------------------
   DRAW ITEMS
---------------------------*/

function updateRadialMenu() {

    const total = curvePoints.length;

    radialItems.forEach((item, index) => {

        const point =
            curvePoints[(index + offset + total) % total];

        item.style.left = point.x + "px";
        item.style.top = point.y + "px";

    });

}

updateRadialMenu();


/* --------------------------
   OPEN
---------------------------*/

menuBtn.onclick=()=>{

    radialMenu.classList.add("active");
    radialOverlay.classList.add("active");

}

/* --------------------------
   CLOSE
---------------------------*/

function closeMenu(){

    radialMenu.classList.remove("active");
    radialOverlay.classList.remove("active");

}

closeRadial.onclick=closeMenu;
radialOverlay.onclick=closeMenu;

document.addEventListener("keydown",(e)=>{

    if(e.key==="Escape"){

        closeMenu();

    }

});


/* --------------------------
   DRAG
---------------------------*/

dragHandle.addEventListener("mousedown",()=>{

    dragging=true;

});

window.addEventListener("mouseup",()=>{

    dragging=false;

});

window.addEventListener("mousemove",(e)=>{

    if(!dragging)return;

    if(e.movementY>8){

        offset++;

        updateRadialMenu();

    }

    if(e.movementY<-8){

        offset--;

        updateRadialMenu();

    }

});


/* --------------------------
   TOUCH
---------------------------*/

let lastY=0;

dragHandle.addEventListener("touchstart",(e)=>{

    dragging=true;

    lastY=e.touches[0].clientY;

});

window.addEventListener("touchend",()=>{

    dragging=false;

});

window.addEventListener("touchmove",(e)=>{

    if(!dragging)return;

    let current=e.touches[0].clientY;

    if(current-lastY>25){

        offset++;

        lastY=current;

        updateRadialMenu();

    }

    if(current-lastY<-25){

        offset--;

        lastY=current;

        updateRadialMenu();

    }

});


/* --------------------------
   MOUSE WHEEL
---------------------------*/

radialMenu.addEventListener("wheel",(e)=>{

    e.preventDefault();

    if(e.deltaY>0){

        offset++;

    }else{

        offset--;

    }

    updateRadialMenu();

});