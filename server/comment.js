// Served at /comment.js and run by the browser on the guest book page.
var strong = document.querySelectorAll("strong")[0];

function lengthCheck() {
  var value = this.getAttribute("value");
  if (value.length > 10) {
    strong.innerHTML = "Comment too long!";
  } else {
    strong.innerHTML = " ";
  }
}

var inputs = document.querySelectorAll("input");
for (var i = 0; i < inputs.length; i++) {
  inputs[i].addEventListener("keydown", lengthCheck);
}
