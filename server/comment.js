// Served at /comment.js and run by the browser on the guest book page.
var strong = document.querySelectorAll("strong")[0];

var allow_submit = true;

function lengthCheck() {
  var value = this.getAttribute("value");
  if (value.length > 10) {
    strong.innerHTML = "Comment too long!";
    allow_submit = false;
  } else {
    strong.innerHTML = " ";
    allow_submit = true;
  }
}

var inputs = document.querySelectorAll("input");
for (var i = 0; i < inputs.length; i++) {
  inputs[i].addEventListener("keydown", lengthCheck);
}

const form = document.querySelectorAll("form")[0];
form.addEventListener("submit", function (event) {
  if (!allow_submit) {
    event.preventDefault();
  }
});
