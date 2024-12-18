$.js = function(el) {
    return $('[data-js=' + el + ']')
};

function carousel() {
    $.js('timeline-carousel').slick({
        infinite: false,
        arrows: false,
        dots: true,
        autoplay: false,
        speed: 1100,
        slidesToShow: 2,
        slidesToScroll: 2,
        responsive: [{
            breakpoint: 800,
            settings: {
                slidesToShow: 1,
                slidesToScroll: 1
            }
        }]
    });
}

// document.querySelector('.carousel-container').addEventListener('wheel', function(event) {
//     const delta = Math.sign(event.deltaY); // Get the direction of the scroll

//     // Scroll by a fixed amount (you can adjust this as needed)
//     this.scrollLeft += delta * 50;

//     // Prevent the default scrolling behavior
//     event.preventDefault();
// });

carousel();