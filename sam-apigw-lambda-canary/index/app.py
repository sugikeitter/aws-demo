HTML_RESPONSE = """
<!doctype html>
<html lang="en">

<head>
  <meta charset="utf-8" />
  <style>
    {style}
  </style>
  <meta name="description" content="Lambda Canary Demo" />
  <title>Lambda Canary Demo</title>
</head>

<body><noscript>You need to enable JavaScript to run this app.</noscript>
  <div id="root">
    <div class="splash-container">
      <div class="splash">
        <h1 class="splash-head">{top_message}</h1>
        <p class="splash-subhead">This page is returned by AWS Lambda</p>
        <p><a class="pure-button pure-button-primary" href="https://aws.amazon.com/jp/lambda/" target="_blank"
            rel="noopener noreferrer">AWS Lambda</a></p>
      </div>
    </div>
  </div>
</body>

</html>
"""

CSS = """
* {
  -webkit-box-sizing: border-box;
  -moz-box-sizing: border-box;
  box-sizing: border-box;
}

/*
 * -- BASE STYLES --
 * Most of these are inherited from Base, but I want to change a few.
 */
body {
  line-height: 1.7em;
  color: #7f8c8d;
  font-size: 13px;
  font-family: sans-serif;
}

h1,
h2,
h3,
h4,
h5,
h6,
label {
  color: #34495e;
}

/*
 * -- PURE BUTTON STYLES --
 * I want my pure-button elements to look a little different
 */
.pure-button {
  background-color: white;
  color: #f7a934;
  padding: 0.5em 2em;
  border-radius: 5px;
}

a.pure-button-primary {
  background: #f7a934;
  color: white;
  border-radius: 5px;
  font-size: 120%;
}

/*
 * -- SPLASH STYLES --
 * This is the blue top section that appears on the page.
 */

.splash-container {
  background: white;
  z-index: 1;
  overflow: hidden;
  /* The following styles are required for the "scroll-over" effect */
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  position: fixed !important;
}

.splash {
  /* absolute center .splash within .splash-container */
  width: 80%;
  height: 50%;
  margin: auto;
  position: absolute;
  top: 100px; left: 0; bottom: 0; right: 0;
  text-align: center;
}

/* This is the main heading that appears on the blue section */
.splash-head {
  font-size: 20px;
  font-weight: bold;
  color: #f7a934;
  border: 3px solid #f7a934;
  padding: 1em 1.6em;
  font-weight: 100;
  border-radius: 5px;
  line-height: 1em;
}

/* This is the subheading that appears on the blue section */
.splash-subhead {
  color: #f7a934;
  letter-spacing: 0.05em;
  opacity: 0.8;
}

/*
 * -- TABLET (AND UP) MEDIA QUERIES --
 * On tablets and other medium-sized devices, we want to customize some
 * of the mobile styles.
 */
@media (min-width: 48em) {

  /* We increase the body font size */
  body {
    font-size: 20px;
  }

  /* We increase the height of the splash-container */
  /*    .splash-container {
          height: 500px;
      }*/

  /* We decrease the width of the .splash, since we have more width
  to work with */
  .splash {
    width: 50%;
    height: 50%;
  }

  .splash-head {
    font-size: 250%;
  }

}

/*
 * -- DESKTOP (AND UP) MEDIA QUERIES --
 * On desktops and other large devices, we want to over-ride some
 * of the mobile and tablet styles.
 */
@media (min-width: 78em) {
  /* We increase the header font size even more */
  .splash-head {
    font-size: 300%;
  }
}
"""

def lambda_handler(event, context):
    return {
        "isBase64Encoded": False,
        "statusCode": 200,
        "headers": {
            "content-type": "text/html; charset=utf-8"
        },
        "body": HTML_RESPONSE.format(
            style=CSS,
            top_message="Hello, v1"
        ),
    }
